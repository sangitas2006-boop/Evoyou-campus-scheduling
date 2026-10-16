# EVOYOU Campus Scheduling: evidence, product requirements and institutional scale

Research reviewed: 16 October 2026. This is a focused evidence review, not an exhaustive market scan or legal novelty search. The goal is an institutional campus scheduling product, not a personal task planner. Current UI schedule state is browser-local; shared backend services, authorization and institutional integrations are required for multi-user operation and campus deployment.

## Real-world scheduling requirements

A college timetable is not just a teacher plus a time. Typical constraints include teacher availability, room occupancy and capacity, room/equipment suitability, students' required courses and section choices, and conflicts among classes attended by the same students. These constraints are documented in the peer-reviewed survey by Babaei, Karimpour and Hadidi, *A survey of approaches for university course timetabling problem* (2015): https://doi.org/10.1016/j.cie.2014.11.010

Real institutions also have travel-time and workload concerns, preferred time/room requests, irregular meetings and multi-week patterns. The International Timetabling Competition 2019 paper describes real university instances and hard/soft constraints: https://link.springer.com/article/10.1007/s10951-023-00801-w

A Purdue deployment paper describes large scheduling scale, room and instructor constraints, student conflicts, minimal-perturbation changes, and the practical importance of inconsistent inputs and interactive schedule editing: https://www.unitime.org/papers/patat07.pdf

Hybrid classes introduce mode preferences and travel-time considerations, with trade-offs among electives, student schedule conflicts, staff assignments, and room availability. Peer-reviewed 2024 study: https://pmc.ncbi.nlm.nih.gov/articles/PMC12130172/

Student-centered scheduling also means balancing faculty preferences with student course access. A report summarizing an AACRAO 2022 survey of 340 U.S. higher-education institutions reports that 78% of institutions said faculty preference strongly influenced scheduling and 27% agreed that their scheduling was student-centered. These figures describe the surveyed U.S. institutions, not Indian colleges or all higher education: https://tacc.org/sites/default/files/2025-08/student-centered-schedule.pdf

## Existing solutions and differentiation boundary

The pasted research accurately identifies established techniques and features, but the category list is not itself a product gap. The focused market check found direct feature overlap:

- **UniTime:** its official site describes course/exam timetabling, timetable changes, room sharing, individual student sectioning and SIS interfacing. Its sectioning description uses student course requests and historical/projected demand, and its constraints include overlapping and back-to-back classes too far apart. Thus demand-aware student sectioning, student-conflict minimization and change management already exist in a mature system.
- **Coursedog:** its academic-scheduling page markets student-pathway alignment, policy rules, section optimization across rooms/faculty/time, scenario testing and workflows. Its integration brief describes SIS data sync and API write-back for configured section updates.
- **Ad Astra:** its product material markets student-demand forecasting, pathway management, room optimization, scenario modeling and Banner/SIS integration. These are vendor claims, not independent performance evidence.
- **CollegeNET / Series25:** its product material describes academic and event scheduling, room-utilization/demand analytics, optimization and SIS connectivity. These are vendor product claims.

Therefore, do not claim that AI/heuristic scheduling, optimization, pathway-aware assignment, analytics, SIS integration, change management or minimal-change repair has never been done. Nor can a quick public-source sweep establish that a specific feature combination has no competitor. Sources below substantiate feature overlap, not independent product quality or the absence of other vendors. Timetabling variants are combinatorially difficult (the cited survey discusses NP-hard formulations), but that classification is not a product differentiator. Solver methods vary by problem and implementation; the reviewed public product pages do not substantiate the claim that all modern commercial systems combine CLP, genetic algorithms and Tabu search. Do not repeat that as a universal industry fact or market EVOYOU on an unverified algorithm stack.

**EVOYOU product bet to validate:** for a sudden class-level outage, package the decision for a department coordinator in a compact recovery brief: (1) a lowest-disruption feasible move, (2) meaningfully different feasible day/room alternatives, (3) visible counts/reasons for candidates rejected by the configured hard checks, (4) the affected configured cohort/section rather than a false claim of exact individual enrollment impact, and (5) an explicit human choice before the local schedule changes. The UI now demonstrates this bounded workflow. Its solver is a sample-week heuristic, not a global constraint solver; the market fit and practical novelty of the workflow need scheduler interviews and head-to-head testing. This is differentiation by operational UX and focus, not a verified unique invention or proof that no competitor offers the combination.

## Current campus scheduling interface

- Root `index.html` is the editorial campus-scheduling homepage; `campus-timetable.html` is the operational scheduling workspace.
- Both pages share an EVOYOU-branded, KYNEX-inspired editorial system: warm paper with a subtle CSS grid, Manrope/Playfair Display/DM Mono typography, deep green and copper accents, glass-like navigation, and restrained workflow cards.
- The old tiled `bg1.png` background and the slate/red/blue workspace styling were removed. EVOYOU's logo and favicon remain as brand assets; KYNEX assets and industrial copy are not reused.
- Provides sample weekly sessions, instructors, cohorts, rooms and capacities.
- Detects overlapping teacher, room, or cohort assignments and rejects a conflicting new session.
- Enforces room-capacity limits and valid start/end times.
- Evaluates a class time-slot or room outage and searches the configured sample week for feasible one-session placements.
- Ranks a recommended low-disruption move alongside up to two materially different options (same day/alternate room; alternate day/same room where feasible), with a selectable option before review.
- Reports how many candidate placements were scanned and feasible, plus rejection totals for unavailable-slot overlap, blocked room, room capacity and teacher/room/cohort conflicts.
- Explains the selected option’s day/room/time trade-offs; shows the affected configured section and student count (not exact individual registrations); provides a copyable notice draft; requires explicit coordinator confirmation before applying locally.
- Labels the search as bounded and one-session; it is not a global optimizer, enrollment-graph analysis or campus publication workflow.
- Includes day filtering, session removal, restore sample schedule, CSV export, and current browser-local persistence.

## Requirements for institutional scale

The current front end uses fictional sample schedule records and browser-local persistence. It is not yet connected to shared institutional data services. Cohort overlap is the configured group rule, not an individual enrollment graph, so it cannot detect cross-listed courses or each student's actual selections. The recovery algorithm searches a bounded sample of days, rooms and times and moves one class at a time; it is not a global optimizer.

Institutional deployment requires a shared backend and governed data integrations. The production scheduling service must incorporate institution-configured instructor and room availability, room equipment, travel times, accessibility, recurring patterns, holidays, fairness and academic policies. A production platform also requires authenticated roles, audit history, transactional shared storage, observability, backup/recovery, institutional security review, notifications, and SIS/calendar integrations. The retained GitHub Pages workflow serves a static front end and is not itself a backend.

A sound validation path is to interview timetable coordinators at several colleges. Walk through a real room/teacher absence, who approves a change, how affected students are identified, how quickly notices must be sent, which scheduling system is already used, and required integration/export formats. Then test whether the impact preview saves coordinator effort and whether a department-level pilot is procurement-feasible. Campus/department pricing or integration/support tiers remain hypotheses until validated.

## Sources

- Babaei, H., Karimpour, J., Hadidi, A. (2015). A survey of approaches for university course timetabling problem. *Computers & Industrial Engineering*. https://doi.org/10.1016/j.cie.2014.11.010
- Müller, T., Rudová, H., Müllerová, Z. Real-world university course timetabling at the International Timetabling Competition 2019. *Journal of Scheduling*. https://link.springer.com/article/10.1007/s10951-023-00801-w
- Murray, K., Müller, T., Rudová, H. Modeling and Solution of a Complex University Course Timetabling Problem. https://www.unitime.org/papers/patat07.pdf
- Davison, M., Kheiri, A., Zografos, K. (2024). Modelling and solving the university course timetabling problem with hybrid teaching considerations. *Journal of Scheduling*. https://pmc.ncbi.nlm.nih.gov/articles/PMC12130172/
- Texas Association of Community Colleges, *Creating a Student-Centered Schedule Utilizing Needs Assessment and Gaps Analysis* (summarizing AACRAO's 2022 survey of 340 U.S. institutions). https://tacc.org/sites/default/files/2025-08/student-centered-schedule.pdf
- UniTime, official project overview and feature directory. https://www.unitime.org/
- UniTime, official student-demand and sectioning description. https://www.unitime.org/sct_description.php
- Coursedog, academic course scheduling and Section Optimizer product page (vendor claims). https://www.coursedog.com/products/academic-course-scheduling-software
- Coursedog, SIS integration brief (describes its configured data flows; vendor document). https://www.coursedog.com/whitepaper/integrations-with-coursedog
- Ad Astra, student-demand forecasting, pathways and scheduling solution page (vendor claims). https://www.aais.com/streamline-system-scheduling-improve-student-success-ad-astra
- CollegeNET, Series25 scheduling overview (vendor claims). https://collegenet.com/series25-the-better-option
- TimetableMaster, vendor product page (marketing claims are not independently verified). https://www.timetablemaster.com/for-universities

## Implemented recovery behavior and validation

- A targeted ranking heuristic prefers a move that keeps the day and room, then minimizes time displacement; it separately surfaces an alternate-room and alternate-day option where feasible, filling remaining slots from the sorted feasible set when those alternatives are unavailable.
- Each slot/room combination is screened against the selected unavailable interval, the explicitly blocked room, room capacity, and configured instructor/room/cohort overlap rules.
- Counts displayed are screening counts, not distinct real-world incidents. Candidate checks are not a quality guarantee or a benchmark.
- The interactive workflow was browser-tested with the sample week: it returned a Monday 11:30–13:00 R101 move for CSE 101, retained the 52-student configured cohort, and required review before local application. This single fictional example is not validation of institutional data or overall solver performance.
