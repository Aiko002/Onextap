/**
 * Onextap Autofill Content Script
 *
 * Injected on demand via chrome.scripting.executeScript({ files: ['content.js'] }).
 * Plain classic browser script — no import/export, no bundler globals.
 *
 * Message contract — every handler but AUTOFILL_TRIGGERED replies
 * synchronously (the listener returns false); AUTOFILL_TRIGGERED replies
 * once its custom dropdowns are done (the listener returns true). Every
 * reply is either { success: true, ... } or { success: false, error: <msg> }:
 *
 *   { action: "AUTOFILL_TRIGGERED", profile }  → { success, filled: <count> }
 *   { action: "SCRAPE_CONTEXT" }               → { success, context: { company, description } }
 *   { action: "DETECT_SECTIONS" }              → { success, sections: { personalInfo, education,
 *                                                    workExperience, openEnded, coverLetter } }
 *   { action: "FILL_COVER_LETTER", text }      → { success } — false when no field matched
 *   { action: "MOUNT_COVER_BUTTON" }           → { success, mounted } — the "Customize cover
 *                                                    letter" button in the cover-letter field's corner;
 *                                                    `type` is read as well as `action`
 *
 * AUTOFILL_TRIGGERED mounts that button too. Its click sends the worker
 * OPEN_COVER_CUSTOMIZER (docs/extension-protocol.md).
 *
 * Other messages without an `action` are ignored.
 */

// ── Duplicate-injection guard ────────────────────────────────────────────────
// The popup may call executeScript more than once. We only register the listener
// the very first time this script lands in the page's isolated world.
if (!window.__onextapAutofillLoaded) {
  window.__onextapAutofillLoaded = true;

  // ── Logging ────────────────────────────────────────────────────────────────
  // Inline on purpose: this file is copied verbatim into the build and cannot
  // import (see the header). It is the trimmed-down sibling of
  // src/logger.js and extension/logger.js.
  //
  // This code runs inside a third-party page, so its output lands in that
  // site's devtools console. Never log profile values, field values, or
  // scraped page text here — only error names, messages, and counts. The
  // richer diagnostics belong in the popup and the service worker.
  //
  // Errors and warnings always print. Set window.__onextapDebug = true in the
  // page console for the verbose ones.
  //
  // This object is the one place in this file allowed to touch the console
  // (CLAUDE.md rule 11); everything else logs through it.
  /* eslint-disable no-console -- the inline logger itself */
  const log = {
    error: (msg, err) => console.error('[Onextap]', msg, err ? errShape(err) : ''),
    warn: (msg, err) => console.warn('[Onextap]', msg, err ? errShape(err) : ''),
    debug: (msg, extra) => {
      if (window.__onextapDebug) console.log('[Onextap]', msg, extra ?? '');
    },
  };
  /* eslint-enable no-console */

  function errShape(err) {
    if (!err || typeof err !== 'object') return { message: String(err) };
    return { name: err.name, message: String(err.message || '').slice(0, 300) };
  }

  // ── React/Vue-safe value setter ────────────────────────────────────────────
  /**
   * Sets the value of an input or textarea in a way that React and Vue detect,
   * then dispatches both 'input' and 'change' events so framework state updates.
   *
   * @param {HTMLInputElement|HTMLTextAreaElement} el
   * @param {string} value
   */
  function setNativeValue(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) {
      desc.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── Visibility / fillability check ────────────────────────────────────────
  /**
   * Returns true when the element is visible and interactive.
   * Treats position:fixed elements as visible even when offsetParent is null.
   *
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  function isVisible(el) {
    if (el.disabled || el.readOnly) return false;
    if (el.offsetParent !== null) return true;
    // offsetParent is null for fixed-position elements too — allow those.
    const style = window.getComputedStyle(el);
    return style.position === 'fixed' && style.display !== 'none' && style.visibility !== 'hidden';
  }

  // ── Label text resolver ────────────────────────────────────────────────────
  /**
   * The text of a node WITHOUT what its form controls hold.
   *
   * A <label> wrapping a <select> wraps every <option> too, and option text
   * in a signature matched intents the field never asked about: a country
   * list holds "United States", which read as a request for the state. The
   * same goes for an open dropdown's list (role="listbox"/"option").
   *
   * A const, not a function declaration, for the reason findCoverLetterField
   * gives (no new properties on the isolated world's window).
   *
   * @param {Node|null} node
   * @returns {string}
   */
  const textOf = (node) => {
    const SKIP = new Set(['SELECT', 'OPTION', 'OPTGROUP', 'DATALIST', 'TEXTAREA', 'SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);
    const parts = [];
    const visit = (n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        parts.push(n.nodeValue);
        return;
      }
      if (n.nodeType !== Node.ELEMENT_NODE || SKIP.has(n.tagName)) return;
      const role = n.getAttribute('role');
      if (role === 'listbox' || role === 'option') return;
      n.childNodes.forEach(visit);
    };
    // The node asked about is read whatever it is: an option's own text is
    // the point when it is the option being read.
    if (node && node.nodeType === Node.ELEMENT_NODE) node.childNodes.forEach(visit);
    else if (node) visit(node);
    return parts.join(' ');
  };

  /**
   * Returns the text that labels an element, from every association it has:
   *   1. aria-labelledby  (react-select, Workday and most custom dropdowns)
   *   2. label[for=id]    (explicit association)
   *   3. a wrapping <label> ancestor  (implicit association)
   *
   * @param {HTMLElement} el
   * @returns {string}
   */
  function getLabelText(el) {
    const parts = [];
    for (const id of (el.getAttribute('aria-labelledby') || '').split(/\s+/)) {
      const ref = id && document.getElementById(id);
      if (ref) parts.push(textOf(ref));
    }
    // Explicit: <label for="fieldId">
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) parts.push(textOf(label));
    }
    // Implicit: el is a descendant of <label>
    const ancestor = el.closest('label');
    if (ancestor) parts.push(textOf(ancestor));
    return parts.join(' ');
  }

  /**
   * What a field is, every way a page says it: a native control or a
   * custom dropdown's trigger.
   */
  const CONTROL_SELECTOR = 'input:not([type="hidden"]), select, textarea, [role="combobox"], [aria-haspopup="listbox"]';

  /**
   * The question a field sits under when nothing labels it.
   *
   * Lever writes the question in a sibling <div> with no <label>, and names
   * the field `cards[…][field0]`, so the field's own attributes say nothing.
   * The nearest ancestor holding this one control, and only this one, is
   * the question's box; its text is the question. An ancestor holding
   * several controls is a section, whose text describes all of them, so the
   * walk stops there.
   *
   * @param {HTMLElement} el
   * @returns {string}
   */
  const questionText = (el) => {
    let node = el.parentElement;
    for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
      if (node === document.body || node.tagName === 'FORM') break;
      if (node.querySelectorAll(CONTROL_SELECTOR).length > 1) break;
      const text = textOf(node).replace(/\s+/g, ' ').trim();
      if (text) return text.slice(0, 300);
    }
    return '';
  };

  // ── Field signature builder ────────────────────────────────────────────────
  /**
   * The matching alphabet: lowercase, punctuation flattened to spaces, runs of
   * whitespace collapsed.
   *
   * Both sides of every comparison go through this. A field signature and a
   * user's custom-field label are written by different people in different
   * places and must still line up — "Mother's Name" on a form and
   * "Mother's  Name" in the profile both have to reduce to "mother s name"
   * or the field silently never fills.
   *
   * Collapsing the runs also repairs built-in matches that used to miss:
   * `name="first__name"` flattened to "first  name", which `includes('first
   * name')` rejected.
   *
   * @param {string} text
   * @returns {string}
   */
  function normalizeForMatch(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Concatenates all identifying text attributes of a field into one
   * lowercase string used for keyword matching.
   *
   * `name` and `id` are written twice, as they are and with camelCase split
   * ("addressState" also as "address State"): the whole-word keywords in
   * hasKeyword() need the word on its own, and the run-together form is what
   * keywords like 'firstname' were written for.
   *
   * `question` (autofill's) adds questionText() for a field nothing labels.
   * The cover-letter finder and the section detector leave it off.
   *
   * @param {HTMLElement} el
   * @param {{ question?: boolean }} [options]
   * @returns {string}
   */
  function fieldSignature(el, { question = false } = {}) {
    const ids = [el.getAttribute('name') || '', el.id || ''];
    const label = getLabelText(el);
    const aria = el.getAttribute('aria-label') || '';
    const parts = [
      ...ids,
      ...ids.map((s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2')),
      el.getAttribute('placeholder') || '',
      aria,
      el.getAttribute('autocomplete') || '',
      label,
      question && !label.trim() && !aria.trim() ? questionText(el) : '',
    ];
    return normalizeForMatch(parts.join(' '));
  }

  /**
   * Keywords short or common enough to sit inside unrelated words, matched
   * as whole words only. As substrings, 'state' claimed "Personal
   * statement" and every question naming "the United States", 'city' claimed
   * "Ethnicity", 'tel' "Tell us about yourself", 'unit' "opportunity", 'race'
   * "trace". Every other keyword is still a substring, which is what lets
   * 'email' find `name="applicantemail"`.
   */
  const WHOLE_WORD_KEYWORDS = new Set([
    'tel', 'cell', 'apt', 'unit', 'suite', 'zip', 'dob', 'sex', 'role', 'town', 'city',
    'state', 'region', 'county', 'notice', 'position', 'race', 'major', 'gpa', 'school',
  ]);

  /**
   * Whether a normalised signature holds a keyword.
   *
   * @param {string} sig
   * @param {string} kw
   * @returns {boolean}
   */
  const hasKeyword = (sig, kw) => (WHOLE_WORD_KEYWORDS.has(kw) ? ` ${sig} `.includes(` ${kw} `) : sig.includes(kw));

  // ── Dial-code stripper ─────────────────────────────────────────────────────
  /**
   * Returns the phone number without its leading international dial code.
   *
   * Only strips a code it can prove: the profile's own `countryCode`, written
   * as "+91", as "0091", or as bare "91" followed by a separator. Anything
   * else is returned untouched — a number that merely starts with the same
   * digits as the dial code ("915551234" for a +91 profile) keeps them,
   * because guessing wrong here deletes real digits from a real phone number.
   *
   * @param {string} phone
   * @param {string} dialCode The profile's dial code, e.g. "+91".
   * @returns {string}
   */
  function stripDialCode(phone, dialCode) {
    const raw = String(phone || '').trim();
    const digits = String(dialCode || '').replace(/[^0-9]/g, '');
    if (!raw || !digits) return raw;

    // "+91 555...", "0091-555...", or "91 555..." — the bare form needs a
    // separator after it so a local number starting with 91 is left alone.
    const prefix = new RegExp(`^(?:\\+\\s*${digits}|00\\s*${digits}|${digits}(?=[\\s().-]))[\\s().-]*`);
    // Empty only when the stored value was nothing but a dial code, which is
    // not a phone number — buildIntents' emptiness filter drops it.
    return raw.replace(prefix, '').trim();
  }

  // ── Intent list builder ────────────────────────────────────────────────────
  /**
   * Converts the profile object into an ordered array of fill intents.
   * ORDER MATTERS: more-specific intents must come before generic ones so
   * that the first keyword match wins correctly.
   *
   * Each intent: { keywords: string[], value: string, kind?: string,
   *                options?: string[], hints?: string[] }
   *
   * `value` is what a text box gets. A dropdown gets the closest option to
   * `options` (else `value`), compared the way `kind` says — see
   * pickOption(): 'country', 'region', 'dial', 'gender', 'degree', 'date',
   * 'number', 'answer' (yes / no / decline, and quantities), or none for
   * plain text. `hints` break ties between options that match equally.
   *
   * The list is the profile's fixed schema PLUS the user's own
   * `customFields`, which lead it — see the block where they are built for
   * why that position is load-bearing. Adding a field to the profile that
   * autofill should know about means adding an entry here; a value with no
   * entry is stored and never used.
   *
   * @param {object} profile
   * @returns {Array<{keywords: string[], value: string}>}
   */
  function buildIntents(profile) {
    const p = profile || {};
    const addr = p.address || {};
    const currentJob = p.currentJob || {};
    const urls = Array.isArray(p.urls) ? p.urls : [];
    const experience = Array.isArray(p.experience) ? p.experience : [];

    // Helper: find a URL by type.
    //
    // CASE-INSENSITIVE, deliberately. The resume parser is prompted for
    // "linkedin|github|portfolio|other" in lowercase while this lookup and the
    // editor's <select> both spell them "LinkedIn|GitHub|Portfolio|Other", so
    // an exact match meant no parsed link ever autofilled. New uploads are
    // canonicalised in src/resumeToProfile.js; this comparison is what lets
    // profiles ALREADY saved with lowercase types work without a re-upload.
    const urlOf = (type) => {
      const want = String(type).toLowerCase();
      const entry = urls.find((u) => u && String(u.type).toLowerCase() === want);
      return entry ? entry.value || '' : '';
    };

    // Derive some composite values
    const fullName =
      [p.firstName, p.lastName].filter(Boolean).join(' ');
    // ── Phone, WITHOUT the dial code ──────────────────────────────────────
    //
    // The profile stores the dial code (`countryCode`, "+91") beside the
    // number because the editor shows them as two boxes, and this used to
    // glue them back together for anything labelled "Phone Number" — a form
    // asking for a phone number got "+915551234567".
    //
    // A phone box wants a phone number. Forms that want the dial code ask for
    // it in their own field, which is what the `country code` intent below
    // fills, so nothing needs the glued form any more.
    //
    // `stripDialCode` is what makes that true for numbers we did not type
    // ourselves: the resume parser writes whatever the CV printed, dial code
    // and all, into `phone`. Dropping the concatenation alone would still
    // leave those numbers filling as "+91 5551234567".
    const dialCode = String(p.countryCode || '').trim();
    const localPhone = stripDialCode(p.phone, dialCode);
    const companyName =
      currentJob.company || (experience[0] && experience[0].company) || '';
    const jobTitle =
      currentJob.title || (experience[0] && experience[0].title) || '';
    const linkedInUrl = urlOf('LinkedIn');
    const githubUrl   = urlOf('GitHub');
    const portfolioUrl = urlOf('Portfolio');
    const skillsText = Array.isArray(p.skills) ? p.skills.join(', ') : '';

    // ── User-defined fields ───────────────────────────────────────────────
    //
    // FIRST IN THE LIST, and that position is the whole design. Matching stops
    // at the first intent whose keyword appears in the field signature, so a
    // custom "Mother's Name" placed after the built-ins would lose the field
    // to the generic `name` keywords below and fill in the candidate's own
    // name instead. The user named this field; their name for it wins.
    //
    // The label is matched through the same normaliser the signature goes
    // through, so what they typed lines up with what the form is labelled
    // whatever punctuation either side used. Labels shorter than three
    // characters are dropped: a one- or two-letter keyword appears inside
    // almost every signature on the page and would carpet the form.
    //
    // Kind 'answer': custom fields are mostly the questions a profile has no
    // slot for ("Authorized to work", "Years of experience"), so a dropdown
    // compares them as yes / no / decline and as quantities.
    const customIntents = (Array.isArray(p.customFields) ? p.customFields : [])
      .map((field) => ({
        keywords: [normalizeForMatch(field && field.label)],
        value: field && typeof field.value === 'string' ? field.value : '',
        kind: 'answer',
      }))
      .filter((intent) => intent.keywords[0].length >= 3);

    // ── Education: the highest degree's row ───────────────────────────────
    //
    // A form asks for one education, and "Highest level of education" is the
    // dropdown nearly all of them have. Its school, field and year come from
    // the same row so the answers describe one degree. A profile whose
    // degrees carry no recognisable level falls back to its first row.
    const education = (Array.isArray(p.education) ? p.education : [])
      .filter((ed) => ed && Object.values(ed).some((v) => typeof v === 'string' && v.trim()));
    const topEducation = education.reduce(
      (best, ed) => (degreeLevel(ed.degree) > degreeLevel(best && best.degree) ? ed : best),
      education[0],
    ) || {};
    const yearIn = (text) => (/\b(?:19|20)\d{2}\b/.exec(String(text || '')) || [''])[0];
    const graduationYear = topEducation.graduationYear || yearIn(topEducation.end)
      || yearIn(topEducation.graduationDate) || yearIn(topEducation.expectedGraduation);

    // ── Self-identification ───────────────────────────────────────────────
    //
    // Race is a list (the editor's chips). A box takes them all; a dropdown,
    // which takes one, gets "Two or More" first when there are several.
    const races = (Array.isArray(p.race) ? p.race : []).filter((r) => typeof r === 'string' && r.trim());
    const raceOptions = races.length > 1 ? ['Two or More Races', 'Two or More', 'Multiracial', ...races] : races;

    // Raw intent list — specific entries before generic ones
    const raw = [
      ...customIntents,
      // ── Name fields (specific before generic) ──────────────────────────────
      {
        keywords: ['first name', 'firstname', 'given name', 'givenname'],
        value: p.firstName,
      },
      {
        keywords: ['last name', 'lastname', 'surname', 'family name', 'familyname'],
        value: p.lastName,
      },
      {
        // Full name: only match "full name" or bare "name" after specifics are
        // handled. We deliberately do NOT include plain "name" here to avoid
        // hitting company-name / school-name fields. Those are handled below.
        keywords: ['full name', 'fullname', 'your name', 'legal name'],
        value: fullName,
      },

      // ── Contact ────────────────────────────────────────────────────────────
      {
        // 'e mail', not 'e-mail': keywords are matched against a signature
        // that has already been through normalizeForMatch(), where every
        // hyphen is a space — so the hyphenated spelling could never fire and
        // bare 'mail' was quietly covering for it. Bare 'mail' also claimed
        // "mailing address" and "mailing country" for the email box.
        keywords: ['email', 'e mail'],
        value: p.email,
      },
      {
        // BEFORE the phone intents: "phone country code" contains "phone", so
        // a dial-code box placed after them collects the whole number.
        //
        // A plain "country code" field is genuinely ambiguous — some forms
        // mean "+91", others mean "IN". Trying the dial code here costs
        // nothing when they meant the ISO code: a <select> of country names
        // has no option matching "+91", fillSelect reports the miss, and the
        // `country` intent further down gets its turn at the same field.
        //
        // +1 is shared (the United States, Canada, the Caribbean), so the
        // person's country breaks the tie between options holding it.
        keywords: [
          'country code', 'countrycode', 'dial code', 'dialcode',
          'phone code', 'phonecode', 'isd code', 'calling code',
          'phone country', 'mobile country',
        ],
        value: dialCode,
        kind: 'dial',
        hints: [p.country, addr.country],
      },
      {
        keywords: ['phone number', 'phonenumber', 'mobile number', 'contact number', 'telephone number'],
        value: localPhone,
      },
      {
        keywords: ['phone', 'mobile', 'tel', 'telephone', 'cell'],
        value: localPhone,
      },

      // ── Social / URL ───────────────────────────────────────────────────────
      {
        keywords: ['linkedin'],
        value: linkedInUrl,
      },
      {
        keywords: ['github'],
        value: githubUrl,
      },
      {
        keywords: ['portfolio', 'website', 'personal site', 'personal url', 'web site'],
        value: portfolioUrl,
      },

      // ── Address (specific before generic) ─────────────────────────────────
      {
        keywords: ['address line 1', 'address1', 'street address', 'street line 1', 'addressline1'],
        value: addr.addressLine1,
      },
      {
        keywords: ['address line 2', 'address2', 'apt', 'suite', 'unit', 'addressline2'],
        value: addr.addressLine2,
      },
      {
        keywords: ['address line 3', 'address3', 'addressline3'],
        value: addr.addressLine3,
      },
      {
        keywords: ['city', 'town', 'municipality'],
        value: addr.city,
      },
      {
        keywords: ['state', 'province', 'region', 'county'],
        value: addr.state,
        kind: 'region',
      },
      {
        keywords: ['postal code', 'postalcode', 'zip code', 'zipcode', 'zip', 'postcode', 'post code'],
        value: addr.postalCode,
      },
      {
        // ── The two countries ─────────────────────────────────────────────
        //
        // The profile holds a country twice: the one in Basic Info, which
        // also picks the phone dial code, and the one inside the address.
        // They are separate on purpose — a mailing address may sit in a
        // different country from the applicant (resumeToProfile.js refuses to
        // collapse them for the same reason).
        //
        // Which one answers a form's "Country" box was the second half of the
        // country bug. This used to read `addr.country || p.country`, and
        // both fields start life as the DEFAULT_PROFILE value, so a user who
        // set Basic Info to India and never scrolled down to the address
        // still autofilled "United States" — the default they never chose,
        // beating the country they did.
        //
        // So: an address-scoped label gets the address country, and a bare
        // "Country" gets the person's. The specific one is listed first
        // because matching stops at the first hit.
        keywords: [
          'address country', 'mailing country', 'country of residence',
          'residence country', 'permanent country', 'home country',
        ],
        value: addr.country || p.country,
        kind: 'country',
      },
      {
        // Bare "country" — after postal/zip so it can't reach a postal code
        // field, and after the dial-code intent up in the Contact block so
        // "country code" is not read as a request for the country.
        keywords: ['country'],
        value: p.country || addr.country,
        kind: 'country',
      },

      // ── Personal ──────────────────────────────────────────────────────────
      {
        keywords: ['gender', 'sex'],
        value: p.gender,
        kind: 'gender',
      },
      {
        // A dropdown here is usually one of three (month, day, year):
        // fillSelect() hands each its part of the date.
        keywords: [
          'date of birth', 'dateofbirth', 'dob', 'birth date', 'birthdate',
          'birthday', 'birth day',
        ],
        value: p.birthDate,
        kind: 'date',
      },

      // ── Self-identification (the EEO questions) ───────────────────────────
      {
        // Before ethnicity: a combined "Race/Ethnicity" list is a list of
        // races ("Asian (Not Hispanic or Latino)").
        keywords: ['race', 'racial'],
        value: races.join(', '),
        options: raceOptions,
      },
      {
        // "Are you Hispanic/Latino?" is the usual form of this question, and
        // its Yes / No answers what the profile says ("Not Hispanic or
        // Latino" → No), which is why it is an 'answer'.
        keywords: ['ethnicity', 'ethnic', 'hispanic', 'latino', 'latinx'],
        value: p.ethnicity,
        kind: 'answer',
      },
      {
        keywords: ['veteran'],
        value: p.veteran,
        kind: 'answer',
      },
      {
        keywords: ['disability', 'disabled'],
        value: p.disability,
        kind: 'answer',
      },

      // ── Work / professional ────────────────────────────────────────────────
      {
        // "current company" / "employer" — must come before bare "company"
        keywords: [
          'current company', 'current employer', 'employer name',
          'company name', 'organization name', 'organisation name',
        ],
        value: companyName,
      },
      {
        keywords: [
          'job title', 'jobtitle', 'current title', 'position', 'current position',
          'role', 'current role', 'designation',
        ],
        value: jobTitle,
      },
      {
        keywords: ['skills', 'skill set', 'skillset', 'technologies', 'competencies'],
        value: skillsText,
      },
      {
        keywords: [
          'expected salary', 'salary expectation', 'pay expectation',
          'desired salary', 'salary requirement',
        ],
        value: p.payExpectation != null ? String(p.payExpectation) : '',
        kind: 'number',
      },
      {
        keywords: [
          'current salary', 'current ctc', 'current compensation', 'present salary',
        ],
        value: p.currentSalary != null ? String(p.currentSalary) : '',
        kind: 'number',
      },
      {
        keywords: [
          'notice period', 'noticeperiod', 'notice', 'joining period',
          'available from', 'availability',
        ],
        value: p.noticePeriod != null ? String(p.noticePeriod) : '',
        kind: 'number',
      },

      // ── Education (specific before generic) ───────────────────────────────
      {
        keywords: ['gpa', 'cgpa', 'grade point', 'cumulative grade'],
        value: topEducation.cgpa,
      },
      {
        keywords: [
          'graduation year', 'year of graduation', 'graduation date', 'year graduated',
          'passing year', 'year of passing', 'graduationyear',
        ],
        value: graduationYear,
      },
      {
        // Before degree and school: "Degree field of study", "College major".
        keywords: [
          'field of study', 'area of study', 'course of study', 'fieldofstudy',
          'major', 'discipline', 'specialization', 'specialisation',
        ],
        value: topEducation.field,
      },
      {
        keywords: [
          'degree', 'level of education', 'education level', 'highest education',
          'highest qualification', 'educational qualification', 'education qualification',
        ],
        value: topEducation.degree,
        kind: 'degree',
      },
      {
        keywords: ['school', 'university', 'college', 'institution', 'alma mater'],
        value: topEducation.school,
      },
    ];

    // Filter out intents with no usable value
    return raw.filter((intent) => intent.value && String(intent.value).trim() !== '');
  }

  // ── Dropdown vocabulary ───────────────────────────────────────────────────
  //
  // A dropdown's options are written by the form, the profile's values by the
  // user or the resume parser, and the two rarely spell an answer alike:
  // "TX" and "Texas", "Female" and "Woman", "M.S." and "Master's Degree",
  // "2 weeks" and "Less than 15 days", "No" and "No, I do not have a
  // disability". This section lines them up. Everything in it is written in
  // normalizeForMatch()'s alphabet: lowercase, punctuation as spaces.

  /** Each row: one answer's spellings. Codes of three letters or fewer only ever match exactly. */
  const aliasRows = (rows) => rows.map((row) => row.split('|'));

  const COUNTRY_ALIASES = aliasRows([
    'united states|united states of america|usa|us|u s a|u s|america',
    'united kingdom|uk|u k|great britain|britain|gb|gbr|england',
    'india|in|ind|bharat', 'canada|ca|can', 'australia|au|aus', 'germany|de|deu|deutschland',
    'united arab emirates|uae|u a e|ae|are', 'south korea|korea|republic of korea|korea republic of|kr|kor',
    'russia|russian federation|ru|rus', 'netherlands|the netherlands|holland|nl|nld',
    'china|people s republic of china|prc|cn|chn', 'hong kong|hong kong sar|hk|hkg', 'taiwan|tw|twn',
    'vietnam|viet nam|vn|vnm', 'czech republic|czechia|cz|cze', 'turkey|turkiye|tr|tur',
    'iran|iran islamic republic of|ir|irn', 'ireland|republic of ireland|ie|irl', 'new zealand|nz|nzl',
    'philippines|the philippines|ph|phl', 'singapore|sg|sgp', 'malaysia|my|mys', 'indonesia|id|idn',
    'pakistan|pk|pak', 'bangladesh|bd|bgd', 'sri lanka|lk|lka', 'nepal|np|npl', 'japan|jp|jpn',
    'france|fr|fra', 'spain|es|esp', 'italy|it|ita', 'portugal|pt|prt', 'belgium|be|bel',
    'switzerland|ch|che', 'austria|at|aut', 'sweden|se|swe', 'norway|no|nor', 'denmark|dk|dnk',
    'finland|fi|fin', 'poland|pl|pol', 'brazil|br|bra', 'mexico|mx|mex', 'argentina|ar|arg',
    'south africa|za|zaf', 'nigeria|ng|nga', 'kenya|ke|ken', 'egypt|eg|egy', 'israel|il|isr',
    'saudi arabia|ksa|sa|sau',
  ]);

  /** US states and Canadian provinces: the name and its postal code. */
  const REGION_ALIASES = aliasRows([
    'alabama|al', 'alaska|ak', 'arizona|az', 'arkansas|ar', 'california|ca', 'colorado|co',
    'connecticut|ct', 'delaware|de', 'district of columbia|washington dc|dc', 'florida|fl',
    'georgia|ga', 'hawaii|hi', 'idaho|id', 'illinois|il', 'indiana|in', 'iowa|ia', 'kansas|ks',
    'kentucky|ky', 'louisiana|la', 'maine|me', 'maryland|md', 'massachusetts|ma', 'michigan|mi',
    'minnesota|mn', 'mississippi|ms', 'missouri|mo', 'montana|mt', 'nebraska|ne', 'nevada|nv',
    'new hampshire|nh', 'new jersey|nj', 'new mexico|nm', 'new york|ny', 'north carolina|nc',
    'north dakota|nd', 'ohio|oh', 'oklahoma|ok', 'oregon|or', 'pennsylvania|pa', 'rhode island|ri',
    'south carolina|sc', 'south dakota|sd', 'tennessee|tn', 'texas|tx', 'utah|ut', 'vermont|vt',
    'virginia|va', 'washington|wa', 'west virginia|wv', 'wisconsin|wi', 'wyoming|wy',
    'puerto rico|pr', 'alberta|ab', 'british columbia|bc', 'manitoba|mb', 'new brunswick|nb',
    'newfoundland and labrador|newfoundland|nl', 'nova scotia|ns', 'ontario|on',
    'prince edward island|pe', 'quebec|qc', 'saskatchewan|sk', 'northwest territories|nt',
    'nunavut|nu', 'yukon|yt',
  ]);

  const GENDER_ALIASES = aliasRows([
    'male|man|m|cis male|cisgender male|cis man',
    'female|woman|f|cis female|cisgender female|cis woman',
    'non binary|nonbinary|genderqueer|gender non conforming|non conforming',
    'transgender|trans',
  ]);

  /** The abbreviations a resume writes, spelled out as option lists do. */
  const DEGREE_ALIASES = aliasRows([
    'b s|bs|b sc|bsc|bachelor of science', 'b a|ba|bachelor of arts',
    'b tech|btech|bachelor of technology', 'b e|be|b eng|beng|bachelor of engineering',
    'b com|bcom|bachelor of commerce', 'bba|bachelor of business administration',
    'bca|bachelor of computer applications', 'm s|ms|m sc|msc|master of science',
    'm a|ma|master of arts', 'm tech|mtech|master of technology',
    'm e|me|m eng|meng|master of engineering', 'mba|master of business administration',
    'm com|mcom|master of commerce', 'mca|master of computer applications',
    'phd|ph d|doctor of philosophy', 'md|doctor of medicine', 'jd|juris doctor',
  ]);

  /**
   * Degree levels, highest first: "M.S." and "Master's Degree" are both 4.
   * Exported to buildIntents() for the profile's highest degree.
   */
  const DEGREE_LEVELS = [
    [5, /\b(?:ph d|phd|doctor|doctorate|doctoral|d phil|dphil|ed d|edd|md|jd|dba)\b/],
    [4, /\b(?:master|masters|m s|ms|m sc|msc|m a|ma|mba|m tech|mtech|m e|me|m eng|meng|m phil|mphil|m com|mcom|mca|mfa|llm|post graduate|postgraduate)\b/],
    [3, /\b(?:bachelor|bachelors|b s|bs|b sc|bsc|b a|ba|b tech|btech|b e|be|b eng|beng|b com|bcom|bca|bba|bfa|llb|undergraduate)\b/],
    [2, /\b(?:associate|associates|diploma|a a|a s|aas)\b/],
    [1, /\b(?:high school|secondary|ged|higher secondary|hsc|ssc|12th|10th|a levels)\b/],
  ];

  /** @param {string} text @returns {number} 0 when no level is recognisable. */
  const degreeLevel = (text) => {
    const norm = normalizeForMatch(text);
    if (!norm) return 0;
    const row = DEGREE_LEVELS.find(([, re]) => re.test(norm));
    return row ? row[0] : 0;
  };

  /**
   * Which way an answer leans: 'yes', 'no', 'decline', or null.
   *
   * What makes "I am not a protected veteran" the option "No", the profile's
   * "No" the option "No, I do not have a disability", and "Decline to
   * Identify" the option "I prefer not to say". Decline is tested first:
   * "I do not wish to answer" is a refusal, not a no.
   *
   * @param {string} norm A normalised string.
   */
  const answerClass = (norm) => {
    if (!norm) return null;
    if (/\b(?:decline|declined|prefer not|rather not|not wish|don t wish|do not wish|not want|don t want|choose not|not to answer|not to say|not to disclose|not to identify|not to specify|no answer|not disclosed|undisclosed)\b/.test(norm)) return 'decline';
    if (/^(?:no|n|none|false|never)\b/.test(norm)
      || /\b(?:not|don t|do not|didn t|did not|doesn t|does not|won t|will not|cannot|can t|haven t|have not|am not|i m not)\b/.test(norm)) return 'no';
    if (/^(?:yes|y|true)\b/.test(norm) || /^i (?:am|have|do|will|can|identify|consider)\b/.test(norm)) return 'yes';
    return null;
  };

  const UNIT_DAYS = { day: 1, week: 7, month: 30, year: 365 };

  /**
   * A quantity, or a range of one, read from text: "2 weeks", "15–30 days",
   * "Less than 15 days", "10+ years", "$150,001 – $200,000", "15 LPA",
   * "Immediately". Null when the text holds none.
   *
   * @param {string} raw Not normalised: "+", "<" and "," carry meaning here.
   * @returns {{ lo: number, hi: number, loOpen: boolean, hiOpen: boolean, unit: string|null }|null}
   */
  const quantityOf = (raw) => {
    const t = String(raw || '').toLowerCase().replace(/[–—−]/g, '-');
    const unitWord = /\b(day|week|month|year|yr)s?\b/.exec(t);
    const unit = unitWord ? (unitWord[1] === 'yr' ? 'year' : unitWord[1]) : null;
    if (!/\d/.test(t)) {
      return /\b(?:immediate|immediately|asap|no notice|none|zero)\b/.test(t)
        ? { lo: 0, hi: 0, loOpen: false, hiOpen: false, unit: unit || 'day' }
        : null;
    }
    const nums = [];
    for (const m of t.matchAll(/(\d+(?:,\d{2,3})*(?:\.\d+)?)\s*(k|lakhs?|lacs?|lpa|l|crores?|cr)?\b/g)) {
      let n = parseFloat(m[1].replace(/,/g, ''));
      if (m[2] === 'k') n *= 1e3;
      else if (m[2] && /^(?:l|lpa|lakhs?|lacs?)$/.test(m[2])) n *= 1e5;
      else if (m[2]) n *= 1e7;
      nums.push(n);
    }
    if (!nums.length) return null;
    if (nums.length >= 2 && /\d\s*(?:-|to|and)\s*\D{0,3}\d/.test(t)) {
      return { lo: nums[0], hi: nums[1], loOpen: false, hiOpen: false, unit };
    }
    if (/\b(?:less than|under|below|fewer than|up to|upto|within|at most|max|maximum)\b|</.test(t)) {
      return { lo: 0, hi: nums[0], loOpen: false, hiOpen: !/\b(?:up to|upto|within|at most|max|maximum)\b/.test(t), unit };
    }
    if (/\+|>|\b(?:more than|over|above|greater than|at least|or more|and above|or above|and over|plus|min|minimum)\b/.test(t)) {
      return { lo: nums[0], hi: Infinity, loOpen: /\b(?:more than|over|above|greater than)\b|>/.test(t) && !/\b(?:or more|or above|and above|and over)\b/.test(t), hiOpen: false, unit };
    }
    return { lo: nums[0], hi: nums[0], loOpen: false, hiOpen: false, unit };
  };

  /** Whether quantity `q` (an option's) holds the point `t` (the profile's), in days when both name a unit. */
  const quantityHolds = (q, t) => {
    const scale = (own, other) => UNIT_DAYS[own.unit || other.unit] || 1;
    const v = t.lo * scale(t, q);
    const lo = q.lo * scale(q, t);
    const hi = q.hi * scale(q, t);
    return (q.loOpen ? v > lo : v >= lo) && (q.hiOpen ? v < hi : v <= hi);
  };

  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

  /** Kinds compared as yes / no / decline, and whose loose matches must lean the same way. */
  const ANSWER_KINDS = new Set(['answer', 'gender']);
  /** Kinds compared as quantities. */
  const QUANTITY_KINDS = new Set(['answer', 'number']);

  /** Whether `phrase` appears in `haystack` as whole words ("male" is not in "female"). */
  const holdsWords = (haystack, phrase) => ` ${haystack} `.includes(` ${phrase} `);

  /**
   * One option, whatever drew it: a native <option> or a custom dropdown's
   * element. `norm` and `normValue` are normalised once here.
   */
  const optionRecord = (el, text, value) => {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    const v = String(value || '').trim();
    return { el, text: t, value: v, norm: normalizeForMatch(t), normValue: normalizeForMatch(v) };
  };

  /**
   * What a dropdown may be answered with for this intent, in preference
   * order, raw: the intent's own spellings, then each one's aliases.
   *
   * @returns {string[]}
   */
  const dropdownCandidates = (intent) => {
    const out = [];
    const add = (s) => {
      const v = String(s || '').trim();
      if (v && !out.includes(v)) out.push(v);
    };
    (intent.options && intent.options.length ? intent.options : [intent.value]).forEach(add);
    const groups = { country: COUNTRY_ALIASES, region: REGION_ALIASES, gender: GENDER_ALIASES, degree: DEGREE_ALIASES }[intent.kind];
    if (groups) {
      for (const own of [...out]) {
        const norm = normalizeForMatch(own);
        // A degree is often "M.S. in Computer Science": its abbreviation leads.
        const row = groups.find((g) => g.includes(norm))
          || (intent.kind === 'degree' && groups.find((g) => g.some((a) => norm.startsWith(`${a} `))));
        if (row) row.forEach(add);
      }
    }
    return out;
  };

  /**
   * The option that answers `intent`, or null.
   *
   * Strongest evidence first, and the first pass that finds anything wins:
   *   1. exact, on the value then the visible text;
   *   2. 'dial': the "+NN" in the option, ties broken by the person's country;
   *   3. answer kinds: the same lean (yes / no / decline);
   *   4. quantities: the option's range holds the profile's number;
   *   5. the option holds the candidate as whole words ("India (+91)");
   *   6. the candidate holds the option ("United States" for "United");
   *   7. 'degree': the same level ("M.S." for "Master's Degree").
   *
   * Passes 5 and 6 are on whole words only (plain `includes` picked
   * "Female" for "Male" and "Niger" for "Nigeria"), skip candidates shorter
   * than two characters, or four for countries and regions, whose ISO codes
   * ("IN", "CA") sit inside a dozen names, and for an answer kind refuse an
   * option leaning the other way: "Veteran" holds "veteran", but is not "I am
   * not a protected veteran".
   *
   * @param {Array<ReturnType<typeof optionRecord>>} options Placeholders already out.
   * @param {object} intent
   */
  const pickOption = (options, intent) => {
    const kind = intent.kind || '';
    const raws = dropdownCandidates(intent);
    const wants = raws.map(normalizeForMatch).filter(Boolean);
    if (!wants.length || !options.length) return null;
    const hints = (intent.hints || []).map(normalizeForMatch).filter(Boolean);
    const settle = (found) => (found.length > 1 && found.find((o) => hints.some((h) => holdsWords(o.norm, h)))) || found[0];
    const firstFor = (test) => {
      for (const w of wants) {
        const found = options.filter((o) => test(o, w));
        if (found.length) return settle(found);
      }
      return null;
    };
    const minLength = kind === 'country' || kind === 'region' ? 4 : 2;
    const leansSame = (o, w) => !ANSWER_KINDS.has(kind) || !answerClass(w) || answerClass(o.norm) === answerClass(w);

    const byDial = () => {
      const want = String(intent.value || '').replace(/\D/g, '');
      if (!want) return null;
      const codeOf = (o) => {
        const m = /\+\s*(\d{1,4}(?:[\s-]\d{1,4})?)/.exec(`${o.text} ${o.value}`);
        return m ? m[1].replace(/\D/g, '') : null;
      };
      const found = options.filter((o) => codeOf(o) === want);
      return found.length ? settle(found) : null;
    };
    const byQuantity = () => {
      for (const raw of raws) {
        const t = quantityOf(raw);
        if (!t) continue;
        const hit = options.find((o) => {
          const q = quantityOf(o.text);
          return q && quantityHolds(q, t);
        });
        if (hit) return hit;
      }
      return null;
    };
    const byLevel = () => {
      const level = wants.map(degreeLevel).find(Boolean);
      return level ? options.find((o) => degreeLevel(o.norm) === level) || null : null;
    };

    return firstFor((o, w) => o.normValue === w)
      || firstFor((o, w) => o.norm === w)
      || (kind === 'dial' && byDial())
      || (ANSWER_KINDS.has(kind) && firstFor((o, w) => !!answerClass(w) && answerClass(o.norm) === answerClass(w)))
      || (QUANTITY_KINDS.has(kind) && byQuantity())
      || firstFor((o, w) => w.length >= minLength && holdsWords(o.norm, w) && leansSame(o, w))
      || firstFor((o, w) => w.length >= minLength && o.norm.length >= 3 && holdsWords(w, o.norm) && leansSame(o, w))
      || (kind === 'degree' && byLevel())
      || null;
  };

  /**
   * A date's part for one of the three <select>s a form splits it into:
   * the year, the month (by name, short name or number) or the day. Which
   * part the select wants is read off its options first (four-digit years,
   * twelve month names) and its label second.
   *
   * @param {Array<ReturnType<typeof optionRecord>>} options
   * @param {string} value The profile's date, "YYYY-MM-DD" as the editor's date box writes it.
   * @param {string} sig The select's signature.
   */
  const pickDatePart = (options, value, sig) => {
    const m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(String(value || '').trim());
    if (!m || !options.length) return null;
    const [year, month, day] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 0];
    const texts = options.map((o) => o.norm);
    const numeric = texts.every((t) => /^\d+$/.test(t));
    const words = ` ${sig} `;
    let part = null;
    if (numeric && texts.some((t) => t.length === 4)) part = 'year';
    else if (texts.filter((t) => MONTHS.some((name) => t === name || t === name.slice(0, 3))).length >= 12) part = 'month';
    else if (/ (?:month|mm|mon) /.test(words)) part = 'month';
    else if (/ (?:day|dd) /.test(words)) part = 'day';
    else if (/ (?:year|yyyy|yy) /.test(words)) part = 'year';
    else if (numeric && texts.length >= 28) part = 'day';
    else if (numeric && texts.length === 12) part = 'month';
    if (!part || (part === 'month' && !MONTHS[month - 1]) || (part === 'day' && !day)) return null;

    const wants = {
      year: [String(year)],
      month: MONTHS[month - 1] ? [MONTHS[month - 1], MONTHS[month - 1].slice(0, 3), String(month)] : [],
      day: [String(day)],
    }[part];
    // "07" and "7" are one month.
    const asNumber = (s) => (/^\d+$/.test(s) ? String(Number(s)) : s);
    for (const w of wants) {
      const hit = options.find((o) => asNumber(o.normValue) === w || asNumber(o.norm) === w);
      if (hit) return hit;
    }
    return null;
  };

  // ── Select-element filler ─────────────────────────────────────────────────
  /**
   * The prompt a <select> opens on, which is never an answer.
   *
   * ═══ PLACEHOLDERS ARE NOT CANDIDATES ═══
   *
   * This was the country bug: `<option value="">` has empty text, every
   * string contains "", and the substring pass picked it for every target,
   * setting the select back to its placeholder. An empty value submits
   * nothing, so it is never an answer. Nor is a prompt WITH a value: an
   * <option> with no value attribute submits its text ("Please select"),
   * and forms number theirs ("0", "-1"), so the text is read too.
   */
  const PLACEHOLDER_OPTION = /^(?:select|choose|please|pick one|pick an?|make a selection|none selected|nothing selected|click to)\b/;

  const isPlaceholderOption = (o) => {
    if (String(o.value).trim() === '') return true;
    const norm = normalizeForMatch(o.text);
    return norm === '' || PLACEHOLDER_OPTION.test(norm);
  };

  /**
   * Whether autofill may choose for this <select>.
   *
   * `el.value` cannot say: it is the selected option's value, so a select
   * resting on "Please select" (no value attribute), on "-- Select --"
   * (value "0"), or on the first row of a list with no placeholder at all
   * looked answered, and every one of them was skipped. A select is open
   * when it shows a placeholder, or the first option of a list in which the
   * page marked none `selected`: a choice nobody made. An option the page
   * marked `selected`, or one the user moved it to, is left alone.
   *
   * @param {HTMLSelectElement} selectEl
   */
  const selectIsOpen = (selectEl) => {
    const chosen = selectEl.options[selectEl.selectedIndex];
    if (!chosen || chosen.disabled || isPlaceholderOption(chosen)) return true;
    const pageChose = Array.from(selectEl.options).some((o) => o.defaultSelected);
    return !pageChose && selectEl.selectedIndex === 0;
  };

  /**
   * Sets a <select> to the option that answers `intent` (pickOption(), or
   * pickDatePart() for a date), then dispatches input and change, which is
   * what React, Vue and Select2 listen for. By index, not by value: values
   * repeat ("+1" for both Canada and the United States).
   *
   * @param {HTMLSelectElement} selectEl
   * @param {object} intent
   * @param {string} sig The select's signature (a date's part is read off it).
   * @returns {boolean} True if an option was selected.
   */
  function fillSelect(selectEl, intent, sig) {
    const options = Array.from(selectEl.options)
      .filter((o) => !o.disabled && !isPlaceholderOption(o))
      .map((o) => optionRecord(o, o.text, o.value));
    const choice = (intent.kind === 'date' && pickDatePart(options, intent.value, sig)) || pickOption(options, intent);
    if (!choice) return false;
    selectEl.selectedIndex = choice.el.index;
    selectEl.dispatchEvent(new Event('input', { bubbles: true }));
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // ── Input type guard ───────────────────────────────────────────────────────
  /**
   * Returns true for input types we are allowed to fill.
   *
   * Allowlist, not a blocklist — anything not listed is skipped. That
   * deliberately excludes password, hidden, file, submit, button, image,
   * range, color and reset, and also checkbox and radio, which need a
   * checked-state decision rather than a value.
   *
   * @param {HTMLInputElement} el
   * @returns {boolean}
   */
  function isFillableInput(el) {
    const fillableTypes = new Set([
      '', 'text', 'email', 'tel', 'url', 'search', 'number', 'date',
      'month', 'week', 'time', 'datetime-local',
    ]);
    return fillableTypes.has((el.type || '').toLowerCase());
  }

  // ── Custom dropdowns ──────────────────────────────────────────────────────
  /**
   * The dropdowns that are not a <select>: react-select (Greenhouse), Workday's
   * buttons, MUI, Radix, Headless UI, Select2's widget — anything that says
   * role="combobox" or aria-haspopup="listbox". Their options do not exist
   * until they are opened, and setting a value does nothing: the only way
   * in is the one a person takes. Open it, find the list, click the option,
   * and check the widget now shows it.
   *
   * One closure in a block-scoped const, like coverButton below.
   */
  const dropdowns = (() => {
    const WIDGET_SELECTOR = '[role="combobox"], [aria-haspopup="listbox"]';
    const OPTION_SELECTOR = '[role="option"]';
    // Older react-select (no roles) and Ant Design (whose role="option" rows
    // are a hidden copy for screen readers): the visible rows by class.
    const LOOSE_OPTION_SELECTOR = '[class*="option" i]';
    // What a widget shows while nothing is chosen.
    const SHOWS_NOTHING = /^(?:$|select|choose|please|pick|search|type|start typing|enter|none selected|nothing selected|click to|make a selection)\b/;
    const NOT_AN_OPTION = /^(?:no options|no results|no matches|nothing found|loading|searching|type to search)\b/;
    const BUDGET_MS = 15000;   // all the dropdowns on a page
    const OPEN_WAIT_MS = 500;  // for a list to appear (Workday's takes a moment)
    const TYPE_WAIT_MS = 1200; // for a searched list (debounce + a request)

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    /** Laid out and not hidden. Unlike isVisible(), indifferent to offsetParent and readOnly. */
    const isShown = (el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      if (typeof el.checkVisibility === 'function') return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
      const style = window.getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none';
    };

    const isWidget = (el) => el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA' && el.matches(WIDGET_SELECTOR);

    const usable = (el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true' && isShown(el);

    const expanded = (el) => el.getAttribute('aria-expanded') === 'true';

    /**
     * What the widget shows as chosen, normalised; '' while it shows a
     * prompt. A trigger shows it in its own text (Workday, MUI, Select2); an
     * input-based one beside the input (react-select's single value sits in
     * the input's grandparent), so that box is read too, unless it holds
     * another field.
     */
    const shows = (el) => {
      const parts = [];
      if (el.tagName === 'INPUT') {
        parts.push(el.value);
        const box = el.parentElement && el.parentElement.parentElement;
        if (box && box.querySelectorAll(CONTROL_SELECTOR).length === 1) {
          const copy = box.cloneNode(true);
          copy.querySelectorAll('label, [class*="placeholder" i]').forEach((n) => n.remove());
          parts.push(textOf(copy));
        }
      } else {
        parts.push(textOf(el));
      }
      const text = normalizeForMatch(parts.join(' '));
      return SHOWS_NOTHING.test(text) ? '' : text;
    };

    /** A full click, as a person's arrives: pointer and mouse, down and up. */
    const press = (el) => {
      const rect = el.getBoundingClientRect();
      const at = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
      const base = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, ...at };
      const pointer = (type, buttons) => (typeof PointerEvent === 'function'
        ? el.dispatchEvent(new PointerEvent(type, { ...base, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true }))
        : true);
      const mouse = (type, buttons) => el.dispatchEvent(new MouseEvent(type, { ...base, buttons }));
      pointer('pointerover', 0);
      mouse('mouseover', 0);
      pointer('pointerdown', 1);
      mouse('mousedown', 1);
      pointer('pointerup', 0);
      mouse('mouseup', 0);
      mouse('click', 0);
    };

    const key = (el, name, keyCode) => {
      for (const type of ['keydown', 'keyup']) {
        el.dispatchEvent(new KeyboardEvent(type, { key: name, code: name, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true }));
      }
    };

    /** The elements that may be this widget's options, shown right now. */
    const optionsNow = (trigger) => {
      const scopes = [];
      for (const id of `${trigger.getAttribute('aria-controls') || ''} ${trigger.getAttribute('aria-owns') || ''}`.split(/\s+/)) {
        const node = id && document.getElementById(id);
        if (node) scopes.push(node);
      }
      const within = (roots, selector) => roots.flatMap((root) => [
        ...(root.matches && root.matches(selector) ? [root] : []),
        ...root.querySelectorAll(selector),
      ]);
      const ok = (o) => !o.closest('select, datalist') && o.getAttribute('aria-disabled') !== 'true'
        && isShown(o) && !NOT_AN_OPTION.test(normalizeForMatch(textOf(o))) && normalizeForMatch(textOf(o)) !== '';
      const pools = [
        () => (scopes.length ? within(scopes, OPTION_SELECTOR) : []),
        () => within([document], OPTION_SELECTOR),
        () => within([document], LOOSE_OPTION_SELECTOR)
          .filter((o) => !o.querySelector(LOOSE_OPTION_SELECTOR) && !o.matches('input, select, option, [role="listbox"]')),
      ];
      for (const pool of pools) {
        const found = pool().filter(ok);
        if (found.length) return found;
      }
      return [];
    };

    /** Options that appeared since `before`, waiting up to `ms` for them. */
    const awaitOptions = async (trigger, before, ms) => {
      const until = Date.now() + ms;
      for (;;) {
        const fresh = optionsNow(trigger).filter((o) => !before.has(o));
        if (fresh.length) {
          await wait(40); // let the rest of the list render
          return optionsNow(trigger).filter((o) => !before.has(o));
        }
        if (Date.now() >= until) return [];
        await wait(25);
      }
    };

    const records = (els) => els.map((el) => optionRecord(el, textOf(el), el.getAttribute('data-value') || el.getAttribute('value') || ''));

    /**
     * Open it the ways a person would, cheapest first: a click, then the
     * keyboard. A click is pointer and mouse events both, because widgets
     * open on different ones (react-select and MUI on mousedown, Workday on
     * click, Radix on pointerdown).
     */
    const open = async (trigger, before) => {
      trigger.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      press(trigger);
      let options = await awaitOptions(trigger, before, OPEN_WAIT_MS);
      if (options.length || expanded(trigger)) return options;
      trigger.focus({ preventScroll: true });
      key(trigger, 'ArrowDown', 40);
      options = await awaitOptions(trigger, before, OPEN_WAIT_MS / 2);
      return options;
    };

    /** Type into an input-based widget the way React and Vue hear it, then read the list. */
    const search = async (trigger, text, before) => {
      trigger.focus({ preventScroll: true });
      setNativeValue(trigger, text);
      trigger.dispatchEvent(new KeyboardEvent('keyup', { key: text.slice(-1), bubbles: true, composed: true }));
      return awaitOptions(trigger, before, TYPE_WAIT_MS);
    };

    /** Click the option, then wait for the widget to show it and its list to go. */
    const choose = async (trigger, option) => {
      option.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      press(option);
      for (let i = 0; i < 20; i += 1) {
        await wait(25);
        if (shows(trigger) && (!option.isConnected || !isShown(option))) return true;
      }
      return false;
    };

    /** Close whatever is still open, as Escape does, and leave the field. */
    const close = (trigger) => {
      if (expanded(trigger) || optionsNow(trigger).length) key(trigger, 'Escape', 27);
    };

    /**
     * One widget: open it, and pick the option that answers the first of
     * `hits` any option answers. A widget that lists nothing until you type
     * (an async search, a typeahead) is typed into, a few candidates at most.
     * Typing that brings up no list at all means a free-text box with
     * suggestions: the text stays, as a text box's would.
     *
     * @returns {Promise<boolean>} Whether it now shows an answer.
     */
    const fillOne = async (trigger, hits) => {
      const before = new Set(optionsNow(trigger));
      const answer = async (els) => {
        const opts = records(els);
        for (const intent of hits) {
          const choice = pickOption(opts, intent);
          if (choice) return choose(trigger, choice.el);
        }
        return false;
      };

      const listed = await open(trigger, before);
      if (listed.length && await answer(listed)) return true;

      const typeable = trigger.tagName === 'INPUT' && !trigger.readOnly;
      if (typeable) {
        let sawList = listed.length > 0;
        const tries = hits.slice(0, 2).flatMap((intent) => dropdownCandidates(intent).slice(0, 2)).slice(0, 3);
        for (const text of tries) {
          const found = await search(trigger, text, before);
          if (found.length) {
            sawList = true;
            if (await answer(found)) return true;
          }
        }
        if (!sawList && tries.length) {
          if (trigger.value !== tries[0]) setNativeValue(trigger, tries[0]);
          return true;
        }
      }
      close(trigger);
      return false;
    };

    /**
     * Every custom dropdown on the page that is empty, matched to the intents
     * the same way a native field is. One at a time, in page order: two open
     * at once would share one list on the page.
     *
     * @param {Array<object>} intents
     * @param {WeakSet<Element>} done Fields already filled, this run.
     * @returns {Promise<number>} How many were filled.
     */
    const fill = async (intents, done) => {
      const started = Date.now();
      let filled = 0;
      for (const el of Array.from(document.querySelectorAll(WIDGET_SELECTOR))) {
        if (Date.now() - started > BUDGET_MS) {
          log.warn('autofill stopped: the dropdowns took too long', { message: `${filled} filled` });
          break;
        }
        try {
          if (done.has(el) || !el.isConnected || !isWidget(el) || !usable(el) || shows(el)) continue;
          const sig = fieldSignature(el, { question: true });
          const hits = intents.filter((intent) => intent.keywords.some((kw) => hasKeyword(sig, kw)));
          if (!hits.length) continue;
          if (await fillOne(el, hits)) {
            done.add(el);
            filled += 1;
          }
        } catch (err) {
          log.warn('error filling dropdown', err);
        }
      }
      return filled;
    };

    return { fill, isWidget };
  })();

  // ── Main autofill routine ─────────────────────────────────────────────────
  /**
   * The native fields: text boxes, textareas and <select>s, matched against
   * the intent list in page order. Synchronous. A field is filled only while
   * empty (a <select>: selectIsOpen()), and gets the first intent that fits:
   * a <select> no option of which answers one intent is offered the next.
   *
   * @param {Array<object>} intents
   * @param {WeakSet<Element>} done Fields already filled, this run.
   * @returns {number} Number of fields filled.
   */
  const fillNativeFields = (intents, done) => {
    let filled = 0;
    for (const el of Array.from(document.querySelectorAll('input, textarea, select'))) {
      try {
        if (done.has(el)) continue;
        // Type guard for <input>
        if (el.tagName === 'INPUT' && !isFillableInput(el)) continue;
        // An <input role="combobox"> is a dropdown: typing a value into it
        // chooses nothing. The dropdown pass opens it instead.
        if (dropdowns.isWidget(el)) continue;
        // Visibility / usability
        if (!isVisible(el)) continue;
        // Skip fields that already hold an answer
        if (el.tagName === 'SELECT' ? !selectIsOpen(el) : (el.value || '').trim() !== '') continue;

        const sig = fieldSignature(el, { question: true });

        // Find first matching intent (order in intents list matters)
        for (const intent of intents) {
          if (!intent.keywords.some((kw) => hasKeyword(sig, kw))) continue;
          let matched;
          if (el.tagName === 'SELECT') {
            matched = fillSelect(el, intent, sig);
          } else {
            setNativeValue(el, intent.value);
            // A box that refuses the value (a date box handed a year) is
            // not filled, and the next intent gets its turn.
            matched = (el.value || '').trim() !== '';
          }
          if (matched) {
            done.add(el);
            filled++;
            break; // only apply one intent per field
          }
        }
      } catch (fieldErr) {
        // One bad field must never abort the run
        log.warn('error filling field', fieldErr);
      }
    }
    return filled;
  };

  /**
   * Fills the page from the profile: the native fields, then the custom
   * dropdowns, then the native fields once more, for the questions an
   * answer revealed (a country's states).
   *
   * Asynchronous because a custom dropdown has to be opened and its list
   * waited for. The listener answers AUTOFILL_TRIGGERED when this settles.
   *
   * @param {object} profile
   * @returns {Promise<number>} Number of fields actually filled.
   */
  async function autofill(profile) {
    const intents = buildIntents(profile);
    if (intents.length === 0) return 0;
    const done = new WeakSet(); // prevent double-filling
    let filled = fillNativeFields(intents, done);
    filled += await dropdowns.fill(intents, done);
    await new Promise((resolve) => setTimeout(resolve, 50));
    filled += fillNativeFields(intents, done);
    return filled;
  }

  // ── Page context scrape (company + description) ───────────────────────────
  /**
   * Best-effort read of the employer/institution name and the longest body of
   * descriptive text on the page, used as AI context.
   *
   * Company is resolved in priority order: og:site_name → known job-board
   * selectors, then school / university / organization ones → the last
   * segment of document.title split on | - — or " at ". Description picks
   * whichever candidate selector yields the most text, skipping any that is
   * a form control, and any job-ad candidate that holds one (an essay
   * wrapper may hold its own textarea, one at most); falls back to
   * document.body only on a page with no form controls (else ''); then
   * collapses whitespace and caps at 8000 chars.
   *
   * NOTE: scrapeJobPage() in extension/background.js does the same job for
   * the service worker, which cannot call into this file — it must be a
   * self-contained function it can serialise into the page. Both open with
   * the same SELECTORS literal, and test/rules/rule5-scraper-selectors.test.js
   * fails if the two copies differ, so a selector fix goes into both. Only
   * this one reads the *Academic lists (school / university / essay markup
   * for the college and scholarship application types).
   *
   * @returns {{ company: string, description: string }}
   */
  function scrapePageContext() {
    // Identical in scrapeJobPage() (extension/background.js): change both or
    // neither. companyAcademic and descriptionAcademic are read only here, on
    // purpose: the job-page scraper must not take a "school" class for the
    // employer. Each academic list is tried after its job-board list.
    const SELECTORS = {
      siteName: 'meta[property="og:site_name"]',
      company: [
        '[class*="company-name" i]',
        '[class*="companyName" i]',
        '[data-testid*="company" i]',
        '.jobs-unified-top-card__company-name',
        '.job-details-jobs-unified-top-card__company-name',
        '[class*="employer" i]',
      ],
      companyAcademic: [
        '[class*="organization" i]',
        '[class*="school" i]',
        '[class*="university" i]',
      ],
      description: [
        '[class*="job-description" i]',
        '[class*="jobDescription" i]',
        '[data-testid*="description" i]',
        '#job-details',
        '.jobs-description',
        '.jobs-box__html-content',
        '[class*="description" i]',
        'article',
        'main',
      ],
      descriptionAcademic: [
        '[class*="personal-statement" i]',
        '[class*="essay" i]',
      ],
      // A description candidate that is or holds one of these is the
      // application form, not the description: an application asks for
      // prose or a file. A search box, a filter or a newsletter field does
      // not make a page a form.
      formControls: 'textarea, input[type="file"]',
    };

    let company = '';
    const ogSite = document.querySelector(SELECTORS.siteName);
    if (ogSite?.content?.trim()) company = ogSite.content.trim();
    if (!company) {
      for (const sel of [...SELECTORS.company, ...SELECTORS.companyAcademic]) {
        const el = document.querySelector(sel);
        if (el?.innerText?.trim()) {
          company = el.innerText.trim();
          break;
        }
      }
    }
    if (!company) {
      const parts = (document.title || '').split(/\s*[|\-—]\s*|\s+at\s+/i);
      if (parts.length > 1) company = parts[parts.length - 1].trim();
    }

    // A candidate holding form controls is the application form: on a page
    // with the ad and the form together, the container of both is longer
    // than the ad (Greenhouse's <main>). Nor is the body a fallback on a page
    // with controls, or the form's questions become the description (Lever's
    // /apply page matches no candidate at all); there it is left empty.
    //
    // Except an essay or personal-statement wrapper, which may hold its own
    // textarea: on an essay page that wrapper is the prompt, and what is typed
    // in a textarea is not in innerText. One textarea at most: a wrapper with
    // several is a whole form in an "essay" class, the case the rule above is
    // for. A candidate that IS a control is still never read, academic or not.
    const isControl = (el) => el.matches(SELECTORS.formControls);
    const holdsControl = (el) => !!el.querySelector(SELECTORS.formControls);
    const textareasIn = (el) => [...el.querySelectorAll(SELECTORS.formControls)].filter((c) => c.localName === 'textarea').length;
    const holdsForm = (el, mayHoldControls) => (mayHoldControls ? textareasIn(el) > 1 : holdsControl(el));
    const candidates = [
      ...SELECTORS.description.map((sel) => ({ sel, mayHoldControls: false })),
      ...SELECTORS.descriptionAcademic.map((sel) => ({ sel, mayHoldControls: true })),
    ];
    let description = '';
    let bestLen = 0;
    for (const { sel, mayHoldControls } of candidates) {
      const el = document.querySelector(sel);
      if (!el || isControl(el) || holdsForm(el, mayHoldControls)) continue;
      const text = (el.innerText || '').trim();
      if (text.length > bestLen) {
        bestLen = text.length;
        description = text;
      }
    }
    const hasForm = !!document.querySelector(SELECTORS.formControls);
    description = (description || (!hasForm && document.body?.innerText) || '').replace(/\s+/g, ' ').trim().slice(0, 8000);
    return { company, description };
  }

  // ── Detect autofill sections on the current page ──────────────────────────
  /**
   * Guess which parts of an application form this page contains, so the popup
   * can show only the relevant "what to fill" toggles.
   *
   * Cheap heuristic: concatenate every field signature on the page into one
   * string and keyword-match it. Each flag is a keyword hit, not proof a
   * matching field exists — a page mentioning "company" in an unrelated input
   * will set workExperience.
   *
   * @returns {{ personalInfo: boolean, education: boolean, workExperience: boolean,
   *             openEnded: boolean, coverLetter: boolean }}
   */
  function detectFormSections() {
    const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
    const sigs = inputs.map((el) => fieldSignature(el)).join(' ');
    const has = (words) => words.some((w) => sigs.includes(w));
    return {
      personalInfo: has(['first name', 'lastname', 'email', 'phone', 'address', 'city', 'postal']),
      education: has(['school', 'university', 'degree', 'gpa', 'graduation', 'major']),
      workExperience: has(['employer', 'company', 'job title', 'experience', 'work history']),
      openEnded: has(['why do you', 'tell us', 'describe', 'additional', 'question']),
      coverLetter: has(['cover letter', 'coverletter', 'personal statement', 'statement of purpose', 'motivation', 'essay']),
    };
  }

  // ── Find the cover letter / essay field ───────────────────────────────────
  /**
   * The page's cover letter / personal statement / essay field, found one way
   * for both of its users: FILL_COVER_LETTER fills it, and the "Customize
   * cover letter" button sits in its bottom-right corner.
   *
   * Two passes: first any visible textarea or text input whose signature
   * matches a cover-letter keyword, then — if none matched, and `guess` is
   * on — the largest empty visible textarea by row count. Filling takes the
   * guess (the user asked to fill this page); the button does not, or it
   * would sit under any textarea on any page the popup is opened on.
   *
   * A const rather than a function declaration: in this classic script a
   * function declared inside the guard's block also becomes a property of the
   * isolated world's window (Annex B), and this file adds no more of those.
   *
   * @param {{ guess?: boolean }} [options]
   * @returns {HTMLTextAreaElement|HTMLInputElement|null}
   */
  const findCoverLetterField = ({ guess = true } = {}) => {
    const candidates = Array.from(document.querySelectorAll('textarea, input[type="text"]'));
    const keywords = [
      'cover letter',
      'coverletter',
      'personal statement',
      'statement of purpose',
      'motivation',
      'essay',
      'additional information',
      'supporting document',
    ];
    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const sig = fieldSignature(el);
      if (keywords.some((kw) => sig.includes(kw))) return el;
    }
    if (!guess) return null;
    // Fallback: largest empty textarea
    let best = null;
    let bestRows = 0;
    for (const el of candidates) {
      if (el.tagName !== 'TEXTAREA' || !isVisible(el)) continue;
      if ((el.value || '').trim()) continue;
      const rows = el.rows || 0;
      if (rows >= bestRows) {
        bestRows = rows;
        best = el;
      }
    }
    return best;
  };

  // ── Fill cover letter / essay textarea ────────────────────────────────────
  /**
   * Drop generated long-form text into the page's cover letter / personal
   * statement / essay field (findCoverLetterField(), guess included), and
   * focus it. Unlike autofill(), a field matched by keyword is overwritten
   * even when it already has content.
   *
   * @param {string} text
   * @returns {boolean} False when the text was blank or no field was found.
   */
  function fillCoverLetter(text) {
    if (!text?.trim()) return false;
    const el = findCoverLetterField();
    if (!el) return false;
    setNativeValue(el, text);
    el.focus?.();
    return true;
  }

  // ── The "Customize cover letter" button ───────────────────────────────────
  /**
   * One button over the page's cover-letter field (its bottom-right corner;
   * the host itself is in <body>), mounted when the popup
   * opens on the page (MOUNT_COVER_BUTTON) and after an autofill. A click
   * reads the job off the page (scrapePageContext(), plus the role) and hands
   * it to the worker (OPEN_COVER_CUSTOMIZER), which opens the dashboard's
   * Cover Letter workspace with it filled in (docs/extension-protocol.md,
   * "The cover-letter handoff").
   *
   * It runs on any site, so it stays out of the page's way:
   *   - its host is appended to <body>, never inside the form, and is
   *     position: fixed, so it takes no room and moves nothing;
   *   - its UI is in a closed shadow root: the page's styles and scripts do
   *     not reach in, and its own styles do not leak out;
   *   - every word in it is ours, set as textContent; nothing read off the
   *     page is ever shown in it;
   *   - it follows the field (scroll, resize, ResizeObserver, and a
   *     MutationObserver on the field's own attributes), hides while the field
   *     is hidden, disabled, covered by something the page pins in place, or
   *     in the top layer (a modal dialog, a popover), and goes when the field
   *     does;
   *   - mounting again keeps one button, also after an extension reload or
   *     update left an older copy of this script's host in the page;
   *   - top frame only: content.js is injected there and nowhere else
   *     (activeTab's reach), so a field inside an iframe gets no button;
   *   - not on the Onextap site itself, where the button would lead back to
   *     the page it is on.
   *
   * Dismissed (×), it stays away until the page loads again.
   *
   * One closure in a block-scoped const, so it adds no name to the isolated
   * world's window (see findCoverLetterField()).
   */
  const coverButton = (() => {
    const HOST_TAG = 'onextap-cover-button';
    const HOST_ATTR = 'data-onextap-cover-button';
    const LABEL = 'Customize cover letter';
    const INSET = 8;  // px between the button and the field's bottom and right edges
    const GRIP = 20;  // px from a resizable textarea's right edge: clear of its grip
    const EDGE = 8;   // px kept clear of the viewport's sides

    // The host is in the page's own DOM, where the page's stylesheets reach
    // it: reset, inline and !important. Fixed: out of the page's flow.
    const HOST_STYLE = [
      ['all', 'initial'],
      ['position', 'fixed'],
      ['top', '0px'],
      ['left', '0px'],
      ['z-index', '2147483647'],
      ['display', 'none'],
      ['margin', '0'],
      ['padding', '0'],
      ['border', '0'],
      ['pointer-events', 'auto'],
    ];

    // The dashboard's ink and citrine (web/dashboard/css/tokens.css).
    // Right-aligned: the host is anchored by its bottom-right corner, and a
    // failure line wider than the bar must not push the bar off the corner.
    const CSS = `
      :host { all: initial; text-align: right; }
      .bar {
        display: inline-flex; align-items: stretch; overflow: hidden;
        font: 600 13px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        color: #0C1710; background: #C6DA43; border-radius: 999px;
        box-shadow: 0 1px 2px rgba(12, 23, 16, .3), 0 4px 14px rgba(12, 23, 16, .18);
      }
      button {
        all: unset; box-sizing: border-box; cursor: pointer;
        font: inherit; color: inherit; padding: 8px 12px;
      }
      .main { padding-left: 14px; white-space: nowrap; }
      .close { padding-left: 9px; font-size: 15px; border-left: 1px solid rgba(12, 23, 16, .22); }
      button:hover { background: rgba(12, 23, 16, .1); }
      button:focus-visible { outline: 2px solid #0C1710; outline-offset: -3px; }
      button:disabled { cursor: progress; opacity: .75; }
      .status {
        margin: 6px 0 0 auto; padding: 7px 10px; max-width: 300px; text-align: left;
        font: 500 12px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        color: #E9E4D4; background: #0C1710; border-radius: 8px;
      }
      .status:empty { display: none; }
    `;

    let mounted = null;      // { host, field, main, status, observer, mutations, frame, busy }
    let dismissed = false;

    /** Constructed styles where they work (no inline-style CSP to trip), else a <style>. */
    function styleRoot(root) {
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(CSS);
        root.adoptedStyleSheets = [sheet];
      } catch {
        const el = document.createElement('style');
        el.textContent = CSS;
        root.append(el);
      }
    }

    function build(field) {
      const host = document.createElement(HOST_TAG);
      host.setAttribute(HOST_ATTR, '');
      for (const [prop, value] of HOST_STYLE) host.style.setProperty(prop, value, 'important');
      const root = host.attachShadow({ mode: 'closed' });
      styleRoot(root);

      const main = document.createElement('button');
      main.type = 'button';
      main.className = 'main';
      main.textContent = LABEL;
      main.setAttribute('aria-label', 'Customize cover letter with Onextap');

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'close';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Hide the Onextap cover letter button');

      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.append(main, close);

      // Failures only, so it is an alert: read out when its text appears.
      const status = document.createElement('p');
      status.className = 'status';
      status.setAttribute('role', 'alert');

      root.append(bar, status);
      document.body.append(host);

      const state = { host, field, main, status, observer: null, mutations: null, frame: 0, busy: false };
      main.addEventListener('click', () => customize(state));
      close.addEventListener('click', dismiss);
      // Capture, to hear scrolls of any container the field sits in.
      window.addEventListener('scroll', schedule, { capture: true, passive: true });
      window.addEventListener('resize', schedule, { passive: true });
      if (typeof ResizeObserver === 'function') {
        // The field (a resize, display: none, removal) and the page (content
        // added above the field moves it).
        state.observer = new ResizeObserver(schedule);
        state.observer.observe(field);
        state.observer.observe(document.documentElement);
      }
      if (typeof MutationObserver === 'function') {
        // What hides or locks the field without changing its size: disabled,
        // readonly, visibility in its style or class. (A class toggled on an
        // ancestor waits for the next scroll or resize.)
        state.mutations = new MutationObserver(schedule);
        state.mutations.observe(field, { attributes: true, attributeFilter: ['disabled', 'readonly', 'hidden', 'style', 'class'] });
      }
      return state;
    }

    /**
     * Whether the field is in the browser's top layer: a modal <dialog>, an
     * open popover, a fullscreen element. That layer draws over everything in
     * <body>, the host included, so a button there could be neither seen nor
     * clicked. Each selector on its own: a browser without one of them throws
     * on the whole list.
     */
    function inTopLayer(field) {
      return ['dialog:modal', ':popover-open', ':fullscreen'].some((selector) => {
        try {
          return !!field.closest(selector);
        } catch {
          return false;
        }
      });
    }

    /** Whether the field can be seen, and filled, right now. */
    function shown(field) {
      if (field.disabled || field.readOnly) return false;
      const rect = field.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      if (typeof field.checkVisibility === 'function') {
        return field.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true });
      }
      const { visibility } = window.getComputedStyle(field);
      return visibility !== 'hidden' && visibility !== 'collapse';
    }

    /**
     * Whether something the page pins in place (a sticky header, a modal, a
     * cookie banner) is at x, y, in a layer the field is not part of. The
     * button would float over it there. A form that is itself in a modal is
     * in that modal's layer, and keeps its button.
     */
    function pinnedOver(x, y, field, host) {
      const hit = document.elementsFromPoint(x, y).find((el) => el !== host);
      for (let el = hit; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
        const { position } = window.getComputedStyle(el);
        if (position === 'fixed' || position === 'sticky') return !el.contains(field);
      }
      return false;
    }

    /** A textarea the user can resize has a grip in that corner. */
    function hasGrip(field) {
      return field.tagName === 'TEXTAREA' && window.getComputedStyle(field).resize !== 'none';
    }

    /**
     * Inside the field's bottom-right corner, so it covers nothing outside the
     * field (under it, it sat on the next field's label). Clear of a
     * textarea's resize grip; on the part of a tall field that is on screen;
     * centred on the right end of a field too short to hold it; kept inside
     * the viewport.
     */
    function place() {
      if (!mounted) return;
      mounted.frame = 0;
      const { host, field } = mounted;
      if (!field.isConnected || !host.isConnected) {
        unmount();
        return;
      }
      if (!shown(field) || inTopLayer(field)) {
        host.style.setProperty('display', 'none', 'important');
        return;
      }
      host.style.setProperty('display', 'block', 'important');
      const rect = field.getBoundingClientRect();
      const own = host.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      const right = rect.right - (hasGrip(field) ? GRIP : INSET);
      const left = Math.round(Math.max(EDGE, Math.min(right - own.width, viewportWidth - own.width - EDGE)));
      const bottom = Math.min(rect.bottom, viewportHeight) - INSET;
      const top = Math.round(rect.height >= own.height + 2 * INSET
        ? Math.max(rect.top + INSET, bottom - own.height)
        : rect.top + (rect.height - own.height) / 2);
      if (pinnedOver(left + own.width / 2, top + own.height / 2, field, host)) {
        host.style.setProperty('display', 'none', 'important');
        return;
      }
      host.style.setProperty('left', `${left}px`, 'important');
      host.style.setProperty('top', `${top}px`, 'important');
    }

    function schedule() {
      if (mounted && !mounted.frame) mounted.frame = requestAnimationFrame(place);
    }

    function unmount() {
      if (!mounted) return;
      const { host, observer, mutations, frame } = mounted;
      mounted = null;
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      mutations?.disconnect();
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      host.remove();
    }

    function dismiss() {
      dismissed = true;
      unmount();
    }

    /**
     * The Onextap site itself (an externally_connectable origin): its Cover
     * Letter workspace is where the button leads, so its own template fields
     * get none.
     */
    function onOwnSite() {
      try {
        const matches = chrome.runtime.getManifest().externally_connectable?.matches || [];
        return matches.some((pattern) => String(pattern).replace(/\/\*$/, '') === location.origin);
      } catch {
        return false;
      }
    }

    /**
     * The role the page is for: a job-title heading, else the first part of
     * its og:title or title. Only the button asks for it: scrapeJobPage() in
     * the worker has no role (SCRAPE_ACTIVE_TAB answers as 1.0.2 did), so
     * this list has no twin to keep in step (CLAUDE.md rule 5). Anything
     * inside a form or a label is the applicant's field, not the job.
     */
    function scrapeRole() {
      const tidy = (text) => String(text || '').replace(/\s+/g, ' ').trim();
      const headings = [
        '.job-details-jobs-unified-top-card__job-title',
        '.jobs-unified-top-card__job-title',
        '[data-automation-id="jobPostingHeader"]',
        '.posting-headline h2',
        '.app-title',
        'h1',
        '[class*="job-title" i]',
        '[class*="jobTitle" i]',
        '[data-testid*="job-title" i]',
      ];
      for (const sel of headings) {
        for (const el of document.querySelectorAll(sel)) {
          if (el.closest('form, label')) continue;
          const text = tidy(el.innerText);
          if (text && text.length <= 200) return text;
        }
      }
      const title = tidy(document.querySelector('meta[property="og:title"]')?.content) || tidy(document.title);
      return title.split(/\s+[|–—-]\s+|\s+at\s+/i)[0].trim();
    }

    /** One word to the user, in the button's own UI: a failure, or nothing. */
    function finish(state, failure) {
      state.busy = false;
      state.main.disabled = false;
      state.main.textContent = LABEL;
      state.status.textContent = failure;
      schedule();
    }

    async function customize(state) {
      if (state.busy) return;
      state.busy = true;
      state.main.disabled = true;
      state.main.textContent = 'Opening…';
      state.status.textContent = '';

      let job;
      try {
        const page = scrapePageContext();
        job = { company: page.company, role: scrapeRole(), description: page.description, url: location.href };
      } catch (err) {
        log.error('page context scrape failed', err);
        finish(state, 'Onextap couldn’t read this page. Paste the job on the dashboard instead.');
        return;
      }

      let reply;
      try {
        reply = await chrome.runtime.sendMessage({ type: 'OPEN_COVER_CUSTOMIZER', job });
      } catch (err) {
        // Most often the extension was reloaded or updated since the page
        // loaded, and this copy of the script can no longer reach it.
        log.warn('could not reach the extension', err);
        finish(state, 'Onextap was updated. Reload this page, then try again.');
        return;
      }
      if (reply?.success) {
        finish(state, '');
        return;
      }
      log.warn('the dashboard did not open', { name: 'OPEN_COVER_CUSTOMIZER', message: String(reply?.error || 'no reply') });
      finish(state, 'Onextap couldn’t open the dashboard. Try again.');
    }

    /**
     * Put the button in the cover-letter field's corner, or move it there: one
     * button, whatever was mounted before.
     * @returns {boolean} Whether there is a button now.
     */
    function mount() {
      if (dismissed || window.top !== window || !document.body || onOwnSite()) return false;
      const field = findCoverLetterField({ guess: false });
      if (!field) {
        unmount();
        return false;
      }
      if (mounted?.field === field && mounted.host.isConnected) {
        schedule();
        return true;
      }
      unmount();
      // A host this copy of the script did not make: the DOM outlives an
      // isolated world, so an extension reload or update leaves the old
      // copy's button behind, its closed root out of our reach. It goes.
      document.querySelectorAll(`[${HOST_ATTR}]`).forEach((el) => el.remove());
      mounted = build(field);
      place();
      return true;
    }

    return { mount };
  })();

  // ── Message listener ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener(function onextapListener(msg, _sender, sendResponse) {
    // The popup, on opening over this page. Read from `type` as well as
    // `action`: the protocol names a message by either.
    if (msg?.action === 'MOUNT_COVER_BUTTON' || msg?.type === 'MOUNT_COVER_BUTTON') {
      try {
        sendResponse({ success: true, mounted: coverButton.mount() });
      } catch (err) {
        log.error('cover letter button failed', err);
        sendResponse({ success: false, mounted: false, error: err.message });
      }
      return false;
    }

    if (!msg?.action) return false;

    if (msg.action === 'AUTOFILL_TRIGGERED') {
      // The one asynchronous reply: custom dropdowns are opened and their
      // lists waited for. `return true` keeps the channel open for it.
      Promise.resolve()
        .then(() => autofill(msg.profile))
        .then((count) => {
          log.debug('autofill complete', { filled: count });
          sendResponse({ success: true, filled: count });
        }, (err) => {
          log.error('autofill failed', err);
          sendResponse({ success: false, error: err.message });
        })
        .then(() => {
          // This is an application form: offer the button in its
          // cover-letter field. After the reply, so it can never cost the
          // autofill its answer.
          try {
            coverButton.mount();
          } catch (err) {
            log.warn('cover letter button failed', err);
          }
        });
      return true;
    }

    if (msg.action === 'SCRAPE_CONTEXT') {
      try {
        sendResponse({ success: true, context: scrapePageContext() });
      } catch (err) {
        log.error('page context scrape failed', err);
        sendResponse({ success: false, error: err.message });
      }
      return false;
    }

    if (msg.action === 'DETECT_SECTIONS') {
      try {
        sendResponse({ success: true, sections: detectFormSections() });
      } catch (err) {
        log.error('form section detection failed', err);
        sendResponse({ success: false, error: err.message });
      }
      return false;
    }

    if (msg.action === 'FILL_COVER_LETTER') {
      try {
        const ok = fillCoverLetter(msg.text || '');
        sendResponse({ success: ok });
      } catch (err) {
        log.error('cover letter fill failed', err);
        sendResponse({ success: false, error: err.message });
      }
      return false;
    }

    return false;
  });

} // end of duplicate-injection guard
