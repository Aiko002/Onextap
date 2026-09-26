import React, { useState, useEffect, useRef } from 'react';
import { Activity, Award, Briefcase, Code, ExternalLink, FileText, Flag, GraduationCap, ListPlus, MapPin, Plus, Save, Trash2, UploadCloud, User } from 'lucide-react';
import { COUNTRIES, GENDERS } from '../../../extension/constants';
import { getExtensionId } from '../../extensionClient';
import {
  DEFAULT_PROFILE,
  RACES,
  VETERAN_STATUS,
  emptyCertificate,
  emptyCustomField,
  emptyEducation,
  emptyExperience,
} from '../../profileDefaults';
import { getActiveLegacyProfile, loadProfileStore, saveLegacyUserProfile } from '../../profileStore';
import { parseResumeFile, RESUME_ACCEPT_ATTR, MAX_RESUME_LABEL } from '../../resumeParse';
import { mergeParsedResumeIntoProfile } from '../../resumeToProfile';
import { saveParsedResume } from '../../resumeStore';
import ProfileSwitcher from '../shared/ProfileSwitcher';
import { useFileDrop } from '../shared/useFileDrop';
import { log as baseLog } from '../../logger';

const log = baseLog.child('ui');

// ------------------------------------------------------------------
// Styling
// ------------------------------------------------------------------
//
// ═══ WHY THESE ARE CONSTANTS ═══
//
// This page has close to fifty form controls. They used to carry a hand-typed
// class string each, and forty-six copies is how a theme change once left
// every value invisible (pale text on a white field) while the labels looked
// fine. So the strings live here once. The look itself is the dashboard's
// design system — `field-input`, `ws-row`, `btn-add` and friends in
// ./dashboard.css — and the page no longer carries a dark variant: the
// dashboard is one visual world, and the workspace sheet is always oat.

/**
 * Text input / select. Full width by default; `is-third` and `is-grow` share a
 * row (they out-rank the base width — a utility appended here would not).
 */
const FIELD_BASE = 'field-input';

/** The common case: a field filling its grid cell. */
const FIELD = FIELD_BASE;

/** The same field inside a repeated row, where everything is a size down. */
const FIELD_SM = `${FIELD_BASE} is-sm`;

/** Multi-line variant. */
const TEXTAREA = FIELD_SM;

/** The tinted card one education / experience / certificate row sits in. */
const ROW_CARD = 'ws-row';

/** "Add education" and friends. */
const ADD_BTN = 'btn-add';

/** Remove-this-row control. */
const TRASH_BTN = 'icon-btn-oat is-danger';

/**
 * A labelled control. Wrapping the control in its <label> is what ties the two
 * together for screen readers and click-to-focus; the old layout put them side
 * by side with no association at all.
 */
const Field = ({ label, className = '', children }) => (
  <label className={`field ${className}`}>
    <span className="field-k">{label}</span>
    {children}
  </label>
);

/** One numbered chapter of the form. */
const Section = ({ n, icon: Icon, title, hint, children }) => (
  <section className="ws-panel">
    <div className="ws-panel-head" style={{ marginBottom: hint ? 10 : 18 }}>
      <div>
        <p className="label ws-eyebrow"><span className="ws-num">{String(n).padStart(2, '0')}</span>Profile</p>
        <h3 className="ws-panel-title ws-section-title">
          <span className="icon-dot" aria-hidden="true"><Icon size={14} /></span>{title}
        </h3>
      </div>
    </div>
    {hint && <p className="ws-sub" style={{ marginBottom: 16 }}>{hint}</p>}
    {children}
  </section>
);

/**
 * "My Profiles" tab — the full profile editor: personal details, address,
 * education, experience, skills, URLs, custom fields, and demographics.
 *
 * Owns resume upload: `parseResumeFile` handles the transport (base64, the
 * GET /api/me preflight, the PARSE_RESUME round trip),
 * `mergeParsedResumeIntoProfile` translates the parser's vocabulary into the
 * editor's, and the result is merged over the existing profile rather than
 * replacing it. That translation is NOT inlined here on purpose — see the
 * header of src/resumeToProfile.js for what it fixes and why it is pure.
 *
 * The parse result is also filed in the resume library, but that write is
 * best-effort — losing the library copy must never cost the user the profile
 * merge — and it is handed the RAW parser output, never the normalised
 * profile, because the corpus builder indexes the parser's own field names.
 *
 * Saving writes through profileStore and then pushes the profile to the
 * extension with ONEXTAP_SYNC_DATA; a failed push is reported but not fatal.
 *
 * @param {object} props
 * @param {(message: string, type?: 'success'|'error'|'loading') => void} props.showToast
 */
const ProfilesPage = ({ showToast }) => {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [status, setStatus] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  // Separate from `status`, which renders as the Save button's label. An
  // upload failure is a sentence — "That file is 3.0 MB. The limit is 2 MB —
  // export a smaller PDF…" — and putting one in a button both wrecks the
  // layout and puts it nowhere near the control it is about. Drag-and-drop
  // makes a rejected file far easier to attempt, so these now get their own
  // line inside the upload panel.
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);
  const skillInputRef = useRef(null);

  useEffect(() => {
    const loadData = async () => {
      await loadProfileStore();
      const saved = await getActiveLegacyProfile();
      if (saved) setProfile(hydrate(saved));
    };
    loadData();
  }, []);

  const handleSave = async () => {
    setStatus('Saving...');

    try {
      await saveLegacyUserProfile(profile);

      // Broadcast to Extension (Direct Message) — popup reads from chrome.storage.local
      let syncOk = false;
      const extId = getExtensionId();
      if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
        if (extId) {
          try {
            syncOk = await new Promise((resolve) => {
              chrome.runtime.sendMessage(extId, {
                type: "ONEXTAP_SYNC_DATA",
                payload: profile
              }, (response) => {
                if (chrome.runtime.lastError) {
                  log.warn("Onextap: Extension sync failed —", chrome.runtime.lastError.message);
                  resolve(false);
                } else {
                  log.info("Extension synced:", response);
                  resolve(response?.success === true);
                }
              });
            });
          } catch (e) {
            log.warn("Onextap: Extension sync error", e);
          }
        } else {
          log.warn("Onextap: Extension ID not available, skipping extension sync");
        }
      }

      setStatus(syncOk ? 'Saved & Synced!' : 'Saved');
      showToast?.(syncOk ? 'Saved successfully' : 'Saved (sync to extension failed)', 'success');
    } catch (error) {
      log.error("Save failed:", error);
      setStatus('Error saving');
      showToast?.('Error saving', 'error');
    }

    setTimeout(() => setStatus(''), 4000);
  };

  // --- RESUME PARSING LOGIC ---
  //
  // The TRANSPORT lives in src/resumeParse.js and the FIELD TRANSLATION in
  // src/resumeToProfile.js. What is left here is the part that is genuinely
  // about this screen: what the user sees while it runs and what they are
  // told when it does not.
  /**
   * The upload itself, shared by the file picker and the drop zone.
   *
   * How the file arrived stays with the caller — the picker has to clear its
   * input — because doing that in the wrong place is invisible until someone
   * uses the other entry point. Mirrors the same split in ResumeSwitcher.
   *
   * @param {File} file
   */
  const startUpload = async (file) => {
    if (!file) return;

    setUploadError('');
    setIsParsing(true);
    setStatus('Parsing resume...');

    try {
      const result = await parseResumeFile(file);
      if (!result.ok) {
        setUploadError(result.error.message);
        setStatus('');
        setIsParsing(false);
        return;
      }

      setProfile((prev) => mergeParsedResumeIntoProfile(prev, result.parsed));

      // Keep a copy in the resume library so the popup shares this one upload.
      // STRICTLY non-blocking: a full store (or any other write failure) must
      // never cost the user the profile merge that just succeeded above, so it
      // downgrades to a warning rather than an error path.
      let storeWarning = '';
      try {
        // Adds it, or selects the copy already stored for these exact bytes:
        // re-uploading the same file is a normal thing to do, and it must not
        // fail on the duplicate-name rule and show a warning for what the user
        // would read as a successful upload. ResumeSwitcher needs the identical
        // rule, so it lives in resumeStore rather than in both screens.
        //
        // `result` goes in UNCHANGED — the raw parser shape, not the merged
        // profile. buildCorpus() reads the parser's own key names and its
        // sourceSpan offsets are computed against result.cvText.
        await saveParsedResume(result);
      } catch (e) {
        storeWarning = e?.message || 'Could not save this resume to your library.';
        log.warn('Onextap: resume library write failed; profile merge kept', { errName: e?.name });
      }

      setStatus(storeWarning ? 'Resume parsed (not saved to library)' : 'Resume parsed!');
      setIsParsing(false);
      showToast?.(
        storeWarning ? `Resume parsed. ${storeWarning}` : 'Resume parsed — review the fields, then Save Changes',
        storeWarning ? 'error' : 'success',
      );
      setTimeout(() => setStatus(''), 3000);
    } catch (error) {
      log.error("Onextap: File upload error:", error);
      setUploadError(error.message || 'Failed to read file. Please try again.');
      setStatus('');
      setIsParsing(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target?.files?.[0];
    // Reset the input first: picking the SAME file twice fires no change event
    // otherwise, which reads to the user as the upload button being dead. This
    // mirrors ResumeSwitcher.handleUpload — the two pickers must behave alike.
    if (event.target) event.target.value = '';
    await startUpload(file);
  };

  /**
   * Files dropped onto the upload panel.
   * @param {File[]} files Never empty.
   */
  const handleDroppedFiles = (files) => {
    setUploadError('');
    if (files.length > 1) {
      setUploadError('Drop one resume at a time.');
      return;
    }
    startUpload(files[0]);
  };

  const { isDragging, dropProps } = useFileDrop({
    onDrop: handleDroppedFiles,
    disabled: isParsing,
  });

  // A new drag is a retry, so the last failure stops applying the moment one
  // starts — otherwise the panel reads "Drop to upload" over a red sentence
  // about the file before it. Mirrors the same effect in ResumeSwitcher.
  useEffect(() => {
    if (isDragging) setUploadError('');
  }, [isDragging]);


  // Array Helpers (support undefined sections)
  const updateItem = (section, index, field, value) => {
    const arr = profile[section] || [];
    const newSection = [...arr];
    if (newSection[index]) {
      newSection[index] = { ...newSection[index], [field]: value };
      setProfile({ ...profile, [section]: newSection });
    }
  };
  const addItem = (section, emptyItem) => {
    const arr = profile[section] || [];
    setProfile({ ...profile, [section]: [...arr, emptyItem] });
  };
  const removeItem = (section, index) => {
    const arr = profile[section] || [];
    setProfile({ ...profile, [section]: arr.filter((_, i) => i !== index) });
  };
  const toggleRace = (race) => {
    const current = profile.race || [];
    if (current.includes(race)) {
      setProfile({ ...profile, race: current.filter(r => r !== race) });
    } else {
      setProfile({ ...profile, race: [...current, race] });
    }
  };
  /**
   * Basic Info's country picker. Sets the country, the dial code beside the
   * phone box, and — conditionally — the address country.
   *
   * ═══ WHY IT REACHES INTO THE ADDRESS ═══
   *
   * There are two countries in this profile and both start at the same
   * DEFAULT_PROFILE value. Autofill answers an address-scoped "Country" from
   * the address one, so a user who set this picker to India and never scrolled
   * down to Address kept autofilling "United States" — a default they never
   * chose, outranking the country they did.
   *
   * The mirror only happens while the two agree, i.e. while the address is
   * still following this picker. Once a user sets a different address country
   * deliberately — a mailing address abroad is a real thing, and
   * resumeToProfile.js declines to collapse the two for the same reason —
   * this stops touching it.
   */
  const handleCountryChange = (e) => {
    const selectedCountry = COUNTRIES.find(c => c.name === e.target.value);
    const addr = profile.address || {};
    const addressWasFollowing = !addr.country || addr.country === profile.country;
    setProfile({
      ...profile,
      country: e.target.value,
      countryCode: selectedCountry ? selectedCountry.dial_code : profile.countryCode,
      address: addressWasFollowing
        ? { ...DEFAULT_PROFILE.address, ...addr, country: e.target.value }
        : profile.address,
    });
  };

  // URL Helpers
  const updateUrl = (index, val) => {
    const u = profile.urls || [];
    const newUrls = [...u];
    if (newUrls[index]) { newUrls[index] = { ...newUrls[index], value: val }; setProfile({ ...profile, urls: newUrls }); }
  };
  const addUrlSlot = () => setProfile({ ...profile, urls: [...(profile.urls || []), { type: 'Other', value: '' }] });
  const updateUrlType = (i, t) => { const u = profile.urls || []; const next = [...u]; if (next[i]) { next[i] = { ...next[i], type: t }; setProfile({ ...profile, urls: next }); } };
  const removeUrl = (i) => setProfile({ ...profile, urls: (profile.urls || []).filter((_, idx) => idx !== i) });

  const updateAddress = (field, value) => setProfile({ ...profile, address: { ...DEFAULT_PROFILE.address, ...(profile.address || {}), [field]: value } });
  const updateCurrentJob = (field, value) => setProfile({ ...profile, currentJob: { ...DEFAULT_PROFILE.currentJob, ...(profile.currentJob || {}), [field]: value } });
  const addSkill = (skill) => {
    const s = (skill || '').trim();
    if (!s || (profile.skills || []).some(x => x.toLowerCase() === s.toLowerCase())) return;
    setProfile({ ...profile, skills: [...(profile.skills || []), s] });
  };
  const removeSkill = (skill) => setProfile({ ...profile, skills: (profile.skills || []).filter(x => x !== skill) });

  const reloadActiveProfile = async () => {
    const saved = await getActiveLegacyProfile();
    if (saved) setProfile(hydrate(saved));
  };

  return (
    <>
      <div className="ws-toolbar">
        <div className="ws-toolbar-grow"><ProfileSwitcher compact onProfileChange={reloadActiveProfile} /></div>
        <button type="button" onClick={handleSave} className="btn btn-solid btn-sm">
          <Save size={14} /> {status || 'Save changes'}
        </button>
      </div>

      {/* RESUME UPLOAD */}
      <div {...dropProps} className="ws-empty" data-dragging={isDragging ? '' : undefined}>
        <div className="ws-empty-icon">
          {isDragging ? <UploadCloud size={22} /> : <FileText size={22} />}
        </div>
        <h3>{isDragging ? 'Drop to upload' : 'Upload a resume'}</h3>
        <p>Auto-fill this profile from a PDF or image — drop one here, up to {MAX_RESUME_LABEL}. Parsed fields merge in; review them, then save.</p>
        <input ref={fileInputRef} type="file" accept={RESUME_ACCEPT_ATTR} onChange={handleFileUpload} className="hidden" id="resume-upload" />
        <label htmlFor="resume-upload" className="btn btn-accent btn-sm" aria-disabled={isParsing ? 'true' : undefined} style={{ cursor: isParsing ? 'progress' : 'pointer' }}>
          {isParsing ? <><Activity className="animate-spin" size={14} /> Parsing…</> : <><UploadCloud size={14} /> Upload resume</>}
        </label>
        {uploadError && <div className="notice notice-danger" role="alert" style={{ marginTop: 4 }}>{uploadError}</div>}
      </div>

      {/* BASIC INFO */}
      <Section n={1} icon={User} title="Basic info">
        <div className="grid grid-cols-6 gap-x-4 gap-y-2">
          <Field label="First name" className="col-span-3">
            <input className={FIELD} value={profile.firstName} onChange={e => setProfile({...profile, firstName: e.target.value})} />
          </Field>
          <Field label="Last name" className="col-span-3">
            <input className={FIELD} value={profile.lastName} onChange={e => setProfile({...profile, lastName: e.target.value})} />
          </Field>
          <Field label="Email" className="col-span-6">
            <input type="email" className={FIELD} value={profile.email} onChange={e => setProfile({...profile, email: e.target.value})} />
          </Field>
          <Field label="Country" className="col-span-3">
            <select className={FIELD} value={profile.country} onChange={handleCountryChange}>
              {COUNTRIES.map(c => <option key={c.code} value={c.name}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={`Phone (${profile.countryCode})`} className="col-span-3">
            <div className="flex gap-2">
              <span className="field-prefix">{profile.countryCode}</span>
              <input className={`${FIELD_BASE} is-grow`} value={profile.phone} onChange={e => setProfile({...profile, phone: e.target.value})} />
            </div>
          </Field>
          <Field label="Birth date" className="col-span-3">
            <input type="date" className={FIELD} value={profile.birthDate} onChange={e => setProfile({...profile, birthDate: e.target.value})} />
          </Field>
          <Field label="Gender" className="col-span-3">
            <select className={FIELD} value={profile.gender} onChange={e => setProfile({...profile, gender: e.target.value})}>
              <option value="">Select...</option>
              {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      {/* LINKS */}
      <Section n={2} icon={ExternalLink} title="Links">
        <div className="ws-stack">
          {(profile.urls || []).map((urlItem, index) => (
            <div key={index} className="flex items-center gap-2">
              <select aria-label="Link type" className={`${FIELD_BASE} is-third`} value={urlItem.type} onChange={(e) => updateUrlType(index, e.target.value)}>
                <option value="LinkedIn">LinkedIn</option>
                <option value="GitHub">GitHub</option>
                <option value="Portfolio">Portfolio</option>
                <option value="Other">Other</option>
              </select>
              <input aria-label="Link URL" className={`${FIELD_BASE} is-grow`} value={urlItem.value} onChange={(e) => updateUrl(index, e.target.value)} placeholder="https://..." />
              <button type="button" onClick={() => removeUrl(index)} className={TRASH_BTN} aria-label="Remove link"><Trash2 size={16} /></button>
            </div>
          ))}
          <button type="button" onClick={addUrlSlot} className={ADD_BTN}><Plus size={14} /> Add link</button>
        </div>
      </Section>

      {/* ADDRESS */}
      <Section n={3} icon={MapPin} title="Address">
        <div className="grid grid-cols-6 gap-x-4 gap-y-2">
          <Field label="Address line 1" className="col-span-6">
            <input className={FIELD} value={profile.address?.addressLine1 || ''} onChange={e => updateAddress('addressLine1', e.target.value)} />
          </Field>
          <Field label="Address line 2" className="col-span-6">
            <input className={FIELD} value={profile.address?.addressLine2 || ''} onChange={e => updateAddress('addressLine2', e.target.value)} />
          </Field>
          <Field label="Address line 3" className="col-span-6">
            <input className={FIELD} value={profile.address?.addressLine3 || ''} onChange={e => updateAddress('addressLine3', e.target.value)} />
          </Field>
          <Field label="City" className="col-span-2">
            <input className={FIELD} value={profile.address?.city || ''} onChange={e => updateAddress('city', e.target.value)} />
          </Field>
          <Field label="State" className="col-span-2">
            <input className={FIELD} value={profile.address?.state || ''} onChange={e => updateAddress('state', e.target.value)} />
          </Field>
          <Field label="Postal code" className="col-span-2">
            <input className={FIELD} value={profile.address?.postalCode || ''} onChange={e => updateAddress('postalCode', e.target.value)} />
          </Field>
          <Field label="Country" className="col-span-6">
            <select className={FIELD} value={profile.address?.country || ''} onChange={e => updateAddress('country', e.target.value)}>
              {COUNTRIES.map(c => <option key={c.code} value={c.name}>{c.name}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      {/* EDUCATION */}
      <Section n={4} icon={GraduationCap} title="Education">
        <div className="ws-stack">
          {(profile.education || []).map((ed, idx) => (
            <div key={idx} className={ROW_CARD}>
              <button type="button" onClick={() => removeItem('education', idx)} className={`${TRASH_BTN} ws-row-remove`} aria-label="Remove education"><Trash2 size={15} /></button>
              <div className="grid grid-cols-6 gap-x-3 gap-y-1">
                <Field label="School" className="col-span-5"><input className={FIELD_SM} value={ed.school || ''} onChange={e => updateItem('education', idx, 'school', e.target.value)} placeholder="School name" /></Field>
                <Field label="Degree" className="col-span-3"><input className={FIELD_SM} value={ed.degree || ''} onChange={e => updateItem('education', idx, 'degree', e.target.value)} placeholder="e.g. B.S." /></Field>
                <Field label="Field" className="col-span-3"><input className={FIELD_SM} value={ed.field || ''} onChange={e => updateItem('education', idx, 'field', e.target.value)} placeholder="e.g. Computer Science" /></Field>
                <Field label="Start" className="col-span-2"><input className={FIELD_SM} value={ed.start || ''} onChange={e => updateItem('education', idx, 'start', e.target.value)} placeholder="YYYY" /></Field>
                <Field label="End" className="col-span-2"><input className={FIELD_SM} value={ed.end || ''} onChange={e => updateItem('education', idx, 'end', e.target.value)} placeholder="YYYY" /></Field>
                <Field label="GPA / CGPA" className="col-span-2"><input className={FIELD_SM} value={ed.cgpa || ''} onChange={e => updateItem('education', idx, 'cgpa', e.target.value)} placeholder="e.g. 3.8" /></Field>
                <Field label="Specialization" className="col-span-3"><input className={FIELD_SM} value={ed.specialization || ''} onChange={e => updateItem('education', idx, 'specialization', e.target.value)} /></Field>
                <Field label="Minor" className="col-span-3"><input className={FIELD_SM} value={ed.minor || ''} onChange={e => updateItem('education', idx, 'minor', e.target.value)} /></Field>
                <Field label="Graduation year" className="col-span-2"><input className={FIELD_SM} value={ed.graduationYear || ''} onChange={e => updateItem('education', idx, 'graduationYear', e.target.value)} placeholder="YYYY" /></Field>
                <Field label="Enrollment year" className="col-span-2"><input className={FIELD_SM} value={ed.enrollmentYear || ''} onChange={e => updateItem('education', idx, 'enrollmentYear', e.target.value)} placeholder="YYYY" /></Field>
                <Field label="Expected graduation" className="col-span-2"><input className={FIELD_SM} value={ed.expectedGraduation || ''} onChange={e => updateItem('education', idx, 'expectedGraduation', e.target.value)} placeholder="YYYY" /></Field>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => addItem('education', emptyEducation())} className={ADD_BTN}><Plus size={14} /> Add education</button>
        </div>
      </Section>

      {/* EXPERIENCE */}
      <Section n={5} icon={Briefcase} title="Experience">
        <div className="ws-stack">
          {(profile.experience || []).map((ex, idx) => (
            <div key={idx} className={ROW_CARD}>
              <button type="button" onClick={() => removeItem('experience', idx)} className={`${TRASH_BTN} ws-row-remove`} aria-label="Remove experience"><Trash2 size={15} /></button>
              <div className="grid grid-cols-6 gap-x-3 gap-y-1">
                <Field label="Company" className="col-span-3"><input className={FIELD_SM} value={ex.company || ''} onChange={e => updateItem('experience', idx, 'company', e.target.value)} /></Field>
                <Field label="Title" className="col-span-3"><input className={FIELD_SM} value={ex.title || ''} onChange={e => updateItem('experience', idx, 'title', e.target.value)} /></Field>
                <Field label="Start" className="col-span-2"><input className={FIELD_SM} value={ex.start || ''} onChange={e => updateItem('experience', idx, 'start', e.target.value)} placeholder="YYYY-MM" /></Field>
                <Field label="End" className="col-span-2"><input className={FIELD_SM} value={ex.end || ''} onChange={e => updateItem('experience', idx, 'end', e.target.value)} placeholder="YYYY-MM or Present" /></Field>
                <div className="col-span-2 flex items-end pb-2">
                  <label className="check"><input type="checkbox" checked={!!ex.isCurrent} onChange={e => updateItem('experience', idx, 'isCurrent', e.target.checked)} /> Current</label>
                </div>
                <Field label="Description" className="col-span-6"><textarea className={TEXTAREA} value={ex.description || ''} onChange={e => updateItem('experience', idx, 'description', e.target.value)} placeholder="Responsibilities, achievements..." /></Field>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => addItem('experience', emptyExperience())} className={ADD_BTN}><Plus size={14} /> Add experience</button>
        </div>
      </Section>

      {/* CERTIFICATES */}
      <Section n={6} icon={Award} title="Certificates">
        <div className="ws-stack">
          {(profile.certificates || []).map((cert, idx) => (
            <div key={idx} className={ROW_CARD}>
              <button type="button" onClick={() => removeItem('certificates', idx)} className={`${TRASH_BTN} ws-row-remove`} aria-label="Remove certificate"><Trash2 size={15} /></button>
              <div className="grid grid-cols-4 gap-x-3 gap-y-1" style={{ paddingRight: 32 }}>
                <Field label="Name"><input className={FIELD_SM} value={cert.name || ''} onChange={e => updateItem('certificates', idx, 'name', e.target.value)} placeholder="Certification name" /></Field>
                <Field label="Issuer"><input className={FIELD_SM} value={cert.issuer || ''} onChange={e => updateItem('certificates', idx, 'issuer', e.target.value)} /></Field>
                <Field label="Date"><input className={FIELD_SM} value={cert.date || ''} onChange={e => updateItem('certificates', idx, 'date', e.target.value)} placeholder="e.g. March 2023" /></Field>
                <Field label="Expiry"><input className={FIELD_SM} value={cert.expiry || ''} onChange={e => updateItem('certificates', idx, 'expiry', e.target.value)} placeholder="e.g. March 2026" /></Field>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => addItem('certificates', emptyCertificate())} className={ADD_BTN}><Plus size={14} /> Add certificate</button>
        </div>
      </Section>

      {/* SKILLS */}
      <Section n={7} icon={Code} title="Skills">
        <div className="flex flex-wrap gap-2" style={{ marginBottom: 14 }}>
          {(profile.skills || []).map(skill => (
            <span key={skill} className="chip" style={{ fontSize: 12.5, padding: '4px 8px 4px 12px' }}>
              {skill}
              <button type="button" onClick={() => removeSkill(skill)} aria-label={`Remove ${skill}`}>&times;</button>
            </span>
          ))}
          {!(profile.skills || []).length && <p className="ws-muted">No skills yet.</p>}
        </div>
        <div className="flex gap-2">
          <input ref={skillInputRef} aria-label="Add a skill" className={`${FIELD_BASE} is-grow`} placeholder="Add a skill (e.g. JavaScript) and press Enter" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(e.target.value); e.target.value = ''; } }} />
          <button type="button" onClick={() => { const el = skillInputRef.current; if (el?.value) { addSkill(el.value); el.value = ''; } }} className="btn btn-solid btn-sm">Add</button>
        </div>
      </Section>

      {/* CURRENT JOB */}
      <Section n={8} icon={Briefcase} title="Current job">
        <div className="grid grid-cols-6 gap-x-4 gap-y-2">
          <Field label="Company" className="col-span-3">
            <input className={FIELD} value={profile.currentJob?.company || ''} onChange={e => updateCurrentJob('company', e.target.value)} />
          </Field>
          <Field label="Title" className="col-span-3">
            <input className={FIELD} value={profile.currentJob?.title || ''} onChange={e => updateCurrentJob('title', e.target.value)} />
          </Field>
          <div className="col-span-6" style={{ paddingTop: 6 }}>
            <label className="check">
              <input type="checkbox" checked={!!profile.currentJob?.isCurrent} onChange={e => updateCurrentJob('isCurrent', e.target.checked)} />
              Currently employed here
            </label>
          </div>
        </div>
      </Section>

      {/* COMPENSATION & AVAILABILITY */}
      <Section n={9} icon={Activity} title="Compensation & availability">
        <div className="grid grid-cols-6 gap-x-4 gap-y-2">
          <Field label="Current salary" className="col-span-2">
            <input className={FIELD} value={profile.currentSalary} onChange={e => setProfile({...profile, currentSalary: e.target.value})} placeholder="e.g. 80,000" />
          </Field>
          <Field label="Pay expectation" className="col-span-2">
            <input className={FIELD} value={profile.payExpectation} onChange={e => setProfile({...profile, payExpectation: e.target.value})} placeholder="e.g. 90,000" />
          </Field>
          <Field label="Notice period" className="col-span-2">
            <input className={FIELD} value={profile.noticePeriod} onChange={e => setProfile({...profile, noticePeriod: e.target.value})} placeholder="e.g. 2 weeks" />
          </Field>
        </div>
      </Section>

      {/* EEO / DEMOGRAPHICS */}
      <Section n={10} icon={Flag} title="EEO / demographics">
        <div className="grid grid-cols-6 gap-x-4 gap-y-2">
          <div className="col-span-6 field" role="group" aria-labelledby="oxd-race-label">
            <span className="field-k" id="oxd-race-label">Race</span>
            <div className="flex flex-wrap gap-2">
              {(RACES || []).map(race => (
                <button
                  type="button"
                  key={race}
                  onClick={() => toggleRace(race)}
                  className="chip chip-toggle"
                  aria-pressed={(profile.race || []).includes(race)}
                >
                  {race}
                </button>
              ))}
            </div>
          </div>
          <Field label="Ethnicity" className="col-span-3">
            <input className={FIELD} value={profile.ethnicity} onChange={e => setProfile({...profile, ethnicity: e.target.value})} placeholder="Optional" />
          </Field>
          <Field label="Veteran status" className="col-span-3">
            <select className={FIELD} value={profile.veteran} onChange={e => setProfile({...profile, veteran: e.target.value})}>
              <option value="">Select...</option>
              {(VETERAN_STATUS || []).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Disability" className="col-span-6">
            <input className={FIELD} value={profile.disability} onChange={e => setProfile({...profile, disability: e.target.value})} placeholder="Optional — decline to identify or describe" />
          </Field>
        </div>
      </Section>

      {/* CUSTOM FIELDS */}
      {/*
        Anything the fixed schema above does not have a box for. The label is
        not decoration: it is what the autofiller matches a form field
        against (see the customFields block at the end of buildIntents() in
        public/content.js), which is why the hint asks for the name as a form
        would print it rather than a nickname for it.
      */}
      <Section
        n={11}
        icon={ListPlus}
        title="Custom fields"
        hint="Anything else forms ask you for — Mother's Name, Roll Number, Visa Status. Name it the way a form labels it, and autofill will match it."
      >
        <div className="ws-stack">
          {(profile.customFields || []).map((field, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                aria-label="Field name"
                className={`${FIELD_BASE} is-third`}
                value={field.label || ''}
                onChange={e => updateItem('customFields', idx, 'label', e.target.value)}
                placeholder="Field name (e.g. Mother's Name)"
              />
              <input
                aria-label="Field value"
                className={`${FIELD_BASE} is-grow`}
                value={field.value || ''}
                onChange={e => updateItem('customFields', idx, 'value', e.target.value)}
                placeholder="Value"
              />
              <button type="button" onClick={() => removeItem('customFields', idx)} className={TRASH_BTN} aria-label="Remove field"><Trash2 size={16} /></button>
            </div>
          ))}
          {!(profile.customFields || []).length && (
            <p className="ws-muted" style={{ fontStyle: 'italic' }}>No custom fields yet.</p>
          )}
          <button type="button" onClick={() => addItem('customFields', emptyCustomField())} className={ADD_BTN}><Plus size={14} /> Add field</button>
        </div>
      </Section>

      <div className="ws-bar" style={{ justifyContent: 'flex-end' }}>
        <button type="button" onClick={handleSave} className="btn btn-solid">
          <Save size={15} /> {status || 'Save changes'} <span className="btn-arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </>
  );
};

/**
 * A stored profile, ready to render.
 *
 * Fills in whatever the saved blob is missing — a profile written by an older
 * build has no `customFields`, and rows saved straight from the parser are
 * missing half the keys the editor binds. `mergeParsedResumeIntoProfile` with
 * an empty parse does exactly that work and nothing else (see its merge
 * contract: an empty value never overwrites), so there is no second
 * hydration path to keep in step with the first.
 *
 * @param {object} saved The active profile in its flat legacy shape.
 * @returns {object} A profile with every key the editor renders.
 */
function hydrate(saved) {
  return mergeParsedResumeIntoProfile(saved, {});
}

export default ProfilesPage;
