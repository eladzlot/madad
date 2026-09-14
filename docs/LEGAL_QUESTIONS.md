# Questions for legal review — Remote tracking (MOH training)

Prepared 2026-09-14 for the lawyer reviewing the server-backed Madad
deployment described in `REMOTE_SPEC.md`. Written in English to match the
technical documents; a Hebrew version can be produced from it.

## What the system does, in one paragraph

Patients in psychotherapy, treated by therapists enrolled in a Ministry of
Health training programme, complete standardised symptom questionnaires
(e.g. PHQ-9, GAD-7, PCL-5) on their phone via a link from their therapist.
The completed answers and scores are sent to a server operated by us and
stored under a random 8-character identifier (the "uid") that the
therapist handed to the patient. The server holds **no name, no contact
details, no free text of any kind, and no therapist-chosen identifier** —
only closed-ended answers, scores, and timestamps. The therapist receives
an email saying "patient <uid> completed a questionnaire" with a link, and
views the patient's score trajectory in a browser. Only the therapist's own
private records connect a uid to a person. The therapist's email address is
the only personal data of any kind on the server.

Facts the answers may depend on:

- **Scale:** ~250 therapists across 8 courses in the first wave, a similar
  number next year; roughly 2,500 patients, several sessions each.
- **Hosting:** Cloudflare (Pages Functions + D1 database). Cloudflare has
  been approved by MOH for this use. D1 data is stored in a Cloudflare
  region chosen at creation; edge code runs worldwide. Backups are
  Cloudflare's.
- **Retention:** indefinite by default; deletion on request is a manual
  operator action.
- **Access:** therapists receive expiring signed links by email, no
  accounts or passwords. Every read is logged (uid, time, hashed IP).
- **Responsible entity:** the training programme is an MOH activity; we
  (Hebrew University / CTR) build and operate the tool.

## A. Classification and registration

1. Under the Protection of Privacy Law and the Data Security Regulations
   (2017), is a database that holds questionnaire answers and clinical
   scores keyed only by a random identifier — with no name, contact detail
   or free text — a database of "sensitive information"? Does the
   pseudonymisation change its classification or the security level
   required (basic / medium / high)?
2. Does this database require registration with the Privacy Protection
   Authority? If so, who is the registrant: MOH, the university, CTR, or an
   individual?
3. Does the number of people with access (up to ~250 therapists, each
   seeing only their own patients' uids) change the classification or
   obligations?
4. Are therapist email addresses, held to route notifications, themselves a
   personal-data database with separate obligations?

## B. Roles and responsibility

5. Who is the data controller ("owner" of the database) and who is the
   processor ("holder"): MOH, the university/CTR as operator, the
   individual therapist, or several of these? What agreements are required
   between them (e.g. a processing agreement between MOH and the operator,
   and between the operator and each therapist)?
6. Is a written agreement with each therapist required before they use the
   system? What must it contain?
7. If a therapist leaves the programme or their employer, what happens to
   their patients' data and links?

## C. Patient consent and disclosure

8. Is the patient's consent required for the transmission and storage
   described above, given that the therapist already collects these
   questionnaires as part of treatment? If so, is a disclosure line on the
   welcome screen sufficient ("your results, without identifying details,
   will be sent to your therapist"), or is an explicit tick-box or signed
   consent needed?
9. What exactly must the disclosure state (purpose, who sees the data,
   retention, right to deletion, hosting outside Israel)?
10. Minors: several instruments are child and parent-report forms
    (SCARED). What differs when the patient is a minor?

## D. Storage, location and security

11. Is storage on Cloudflare infrastructure (data at rest in a Cloudflare
    region, code executing at edge locations worldwide) permissible for
    this data, and does any transfer-abroad rule apply? Does the MOH
    approval we received cover this question, or is it separate?
12. What security obligations follow from the classification in A —
    access logging, log retention period, periodic review, penetration
    testing, incident response plan, appointment of a security officer?
13. We log every read with a hashed IP address. Is IP logging required,
    permitted, or itself a concern?
14. Is a backup-and-restore drill and a documented recovery plan required?

## E. Retention and deletion

15. Is indefinite retention permissible for this data, or must we set a
    retention period? If a period is required, what is defensible for
    ongoing psychotherapy measurement (treatment can last years)?
16. Deletion requests: only the therapist can map a uid to a person. Is a
    process where the patient asks the therapist, who asks us, acceptable?
    Must the operator be able to act on a request directly from the patient?
17. When the training programme ends, what must happen to the data?

## F. Incidents

18. What are our breach-notification obligations (to the Authority, to
    MOH, to therapists, to patients) and within what time frame? Does the
    absence of identifying data change them?
19. If a signed link is forwarded or leaks, the recipient can see one
    patient's scores under a uid. Is that a reportable incident?

## G. Clinical duty of care

20. The system does **not** monitor for risk: a suicidality item scoring
    high produces no automatic action beyond the PDF and the score the
    therapist sees when they open the link. The notification email
    deliberately contains no clinical content. Should the terms state that
    this is not an emergency service, and is that statement sufficient?
    Would adding a generic "alert" marker to the email (no detail) change
    our exposure either way?
21. Who is responsible for acting on an alert: the therapist, the course,
    MOH, or the operator?

## H. Terms and documents to produce

22. Which documents should exist before the first wave: privacy policy,
    therapist terms of use, MOH–operator agreement, database-registration
    filing, security procedure document, patient-facing disclosure text?
23. Is anything required in the PDF the patient can download (it carries
    the uid and the scores)?

## I. Future: private therapists (phase 2)

24. If the same service is later offered to independent therapists outside
    the MOH programme, each becomes a separate controller and we become a
    processor for many. What changes in registration, agreements and
    operating entity (company / non-profit / individual)?
