/**
 * A heavily filled CV, for the dropdown autofill test
 * (tests/autofill-dropdowns.spec.js): every section the profile has, and
 * the editor-only fields a resume does not carry, all set.
 *
 * EVERYONE AND EVERYTHING HERE IS INVENTED, as in test/evals/fixtures/cvs.js:
 * example.com addresses, a 555 phone number, made-up employers and schools.
 * No PII may be added to this file.
 *
 *   HEAVY_CV_TEXT     the resume as text. heavy-cv.pdf beside this file is
 *                     it laid out as a CV (`node scripts/make-heavy-cv-pdf.mjs`
 *                     writes it; run that after changing this text). The test
 *                     uploads the PDF; upload it by hand to put the real
 *                     parser in front of every section.
 *   HEAVY_CV_PARSE    a RECORDED parse of it, in the schema POST
 *                     /api/parse-resume returns (server/prompts/resumeParse.js).
 *                     The test stubs the route with it: no model is called.
 *   HEAVY_CV_EXTRAS   what the user types on My Profiles after the upload,
 *                     because a resume does not say it (birth date, gender,
 *                     self-identification, pay, notice, custom fields).
 */

export const HEAVY_CV_TEXT = `Imogen Thackeray-Vale
imogen.vale@example.com · +1 (555) 014-2290 · 1180 Larkspur Avenue, Apt 4B, Austin, TX 78704, United States
linkedin.com/in/imogen-vale-example · github.com/imogen-vale-example · imogenvale.example.com

Summary
Staff software engineer with ten years building payment, ledger and data platforms.

Experience
Staff Software Engineer, Quillfeather Systems — 2021-03 to Present
Led the ledger rewrite that moved 40M daily transactions onto an event-sourced core.
Set the on-call and incident review process for six teams.

Senior Software Engineer, Brightmoor Payments — 2018-07 to 2021-02
Built the card-authorisation service in Go; p99 latency down from 220 ms to 35 ms.

Software Engineer, Halvard Logistics — 2016-08 to 2018-06
Shipped the routing API and its Postgres partitioning scheme.

Software Engineering Intern, Corvane Labs — 2015-05 to 2015-08
Wrote the internal feature-flag dashboard in React.

Education
M.S. in Computer Science, Brookhollow State University — 2016 to 2018, GPA 3.9, specialization in Distributed Systems
B.S. in Electrical Engineering, Calderwood Institute of Technology — 2012 to 2016, GPA 3.7, minor in Mathematics

Certifications
AWS Certified Solutions Architect – Professional, Amazon Web Services, 2022-04, expires 2025-04
Certified Kubernetes Administrator, The Linux Foundation, 2021-09, expires 2024-09
Google Professional Data Engineer, Google Cloud, 2020-11

Skills
Go, Python, TypeScript, Java, Kotlin, SQL, PostgreSQL, Kafka, Redis, gRPC, GraphQL, React, Node.js,
Docker, Kubernetes, Terraform, AWS, GCP, Airflow, dbt, Spark, Snowflake, Prometheus, Grafana, CI/CD`;

export const HEAVY_CV_PARSE = {
  firstName: 'Imogen',
  lastName: 'Thackeray-Vale',
  email: 'imogen.vale@example.com',
  phone: '+1 (555) 014-2290',
  address: { street: '1180 Larkspur Avenue', line2: 'Apt 4B', city: 'Austin', state: 'TX', zip: '78704', country: 'United States' },
  education: [
    { school: 'Brookhollow State University', degree: 'M.S.', field: 'Computer Science', specialization: 'Distributed Systems', minor: '', startDate: '2016', endDate: '2018', gpa: '3.9' },
    { school: 'Calderwood Institute of Technology', degree: 'B.S.', field: 'Electrical Engineering', specialization: '', minor: 'Mathematics', startDate: '2012', endDate: '2016', gpa: '3.7' },
  ],
  experience: [
    { company: 'Quillfeather Systems', title: 'Staff Software Engineer', startDate: '2021-03', endDate: 'Present', description: 'Led the ledger rewrite that moved 40M daily transactions onto an event-sourced core. Set the on-call and incident review process for six teams.' },
    { company: 'Brightmoor Payments', title: 'Senior Software Engineer', startDate: '2018-07', endDate: '2021-02', description: 'Built the card-authorisation service in Go; p99 latency down from 220 ms to 35 ms.' },
    { company: 'Halvard Logistics', title: 'Software Engineer', startDate: '2016-08', endDate: '2018-06', description: 'Shipped the routing API and its Postgres partitioning scheme.' },
    { company: 'Corvane Labs', title: 'Software Engineering Intern', startDate: '2015-05', endDate: '2015-08', description: 'Wrote the internal feature-flag dashboard in React.' },
  ],
  skills: [
    'Go', 'Python', 'TypeScript', 'Java', 'Kotlin', 'SQL', 'PostgreSQL', 'Kafka', 'Redis', 'gRPC', 'GraphQL', 'React', 'Node.js',
    'Docker', 'Kubernetes', 'Terraform', 'AWS', 'GCP', 'Airflow', 'dbt', 'Spark', 'Snowflake', 'Prometheus', 'Grafana', 'CI/CD',
  ],
  urls: [
    { type: 'linkedin', value: 'https://linkedin.com/in/imogen-vale-example' },
    { type: 'github', value: 'https://github.com/imogen-vale-example' },
    { type: 'portfolio', value: 'https://imogenvale.example.com' },
  ],
  certificates: [
    { name: 'AWS Certified Solutions Architect – Professional', issuer: 'Amazon Web Services', date: '2022-04', expiry: '2025-04' },
    { name: 'Certified Kubernetes Administrator', issuer: 'The Linux Foundation', date: '2021-09', expiry: '2024-09' },
    { name: 'Google Professional Data Engineer', issuer: 'Google Cloud', date: '2020-11', expiry: '' },
  ],
  currentJob: { company: 'Quillfeather Systems', title: 'Staff Software Engineer' },
};

/**
 * Typed on My Profiles after the upload. `race` is the chip labels to press;
 * the rest are field values. The custom fields answer the questions a profile
 * has no slot for, as a user would add them.
 */
export const HEAVY_CV_EXTRAS = {
  birthDate: '1993-07-14',
  gender: 'Female',
  race: ['Asian'],
  ethnicity: 'Not Hispanic or Latino',
  veteran: 'I am not a protected veteran',
  disability: 'No',
  currentSalary: '165,000',
  payExpectation: '185,000',
  noticePeriod: '2 weeks',
  customFields: [
    { label: 'Authorized to work', value: 'Yes' },
    { label: 'Require sponsorship', value: 'No' },
    { label: 'Years of experience', value: '10' },
    { label: 'How did you hear', value: 'LinkedIn' },
    { label: 'Willing to relocate', value: 'Yes' },
  ],
};
