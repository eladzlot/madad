# Documentation

Start with **HANDOVER**. It covers the project's current state and points to
the rest.

## Start here

- [HANDOVER.md](HANDOVER.md) — the project's current state, architecture, repository structure, security model, and what not to change without a plan.
- [TODO.md](TODO.md) — the backlog, the decisions log (D-n, append-only) and the task archive.
- [CODE_ORGANIZATION.md](CODE_ORGANIZATION.md) — which surfaces exist, where code lives, the cross-import rules, and the two builds and two domains (§6.1).

## Specs

- [BEHAVIORAL_SPEC.md](BEHAVIORAL_SPEC.md) — how the app behaves, from the patient's and the clinician's side.
- [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md) — how it is built: modules, data flow, URL design.
- [CONFIG_SCHEMA_SPEC.md](CONFIG_SCHEMA_SPEC.md) — the reference for the questionnaire config JSON.
- [ITEM_TYPES_SPEC.md](ITEM_TYPES_SPEC.md) — item types beyond select, binary and instructions.
- [DSL_SPEC.md](DSL_SPEC.md) — the expression language used for scoring, alerts and conditions.
- [SEQUENCE_SPEC.md](SEQUENCE_SPEC.md) — the sequence runner: `if`/`randomize` at battery and item level.
- [RENDER_SPEC.md](RENDER_SPEC.md) — the rendering layer: the controller and the components.
- [COMPOSER_SPEC.md](COMPOSER_SPEC.md) — the Composer, which builds patient links.
- [AGGREGATE_SPEC.md](AGGREGATE_SPEC.md) — the Aggregate, which turns past PDFs into trajectories.
- [I18N_SPEC.md](I18N_SPEC.md) — multi-language support: decisions L-1 to L-11 and the phases.
- [INSTRUMENTS.md](INSTRUMENTS.md) — the instrument library and where the authoring guides are.

## Plans (not decided)

- [IDIOGRAPHIC_PLAN.md](IDIOGRAPHIC_PLAN.md) — personalised measures carried in the URL. Exploration only.

## Process

- [TESTING_POLICY.md](TESTING_POLICY.md) — what a test must protect, and which layer each kind of test belongs in.
- Adding an instrument: [`public/configs/CONTRIBUTING.md`](../public/configs/CONTRIBUTING.md) (by hand) or [`public/configs/LLM_GUIDE.md`](../public/configs/LLM_GUIDE.md) (LLM-assisted).
- The brand mark: [`brand/README.md`](../brand/README.md).

## Archive

- [archive/REVIEW-2026-04.md](archive/REVIEW-2026-04.md) — the one-off deep review that produced the TODO backlog. A historical record that is not kept up to date.
