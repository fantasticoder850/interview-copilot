// The one structured plain-text format every resume uses. Served to the UI as
// a placeholder/example and used as the target structure when parsing a PDF.
export const RESUME_TEMPLATE = `NAME: Jane Doe
TARGET ROLE: Senior Backend Engineer
LOCATION: Austin, TX (open to remote)
CONTACT: jane@example.com | +1 555 0100 | linkedin.com/in/janedoe | github.com/janedoe

SUMMARY
8 years building backend systems. Specialises in distributed services with Go,
PostgreSQL and AWS. Cut p99 API latency by 45% at Acme.

SKILLS
Languages: Go, Python, TypeScript
Frameworks: gRPC, Gin, FastAPI, Node.js
Data: PostgreSQL, Redis, Kafka
Cloud and DevOps: AWS (ECS, Lambda, RDS), Docker, Kubernetes, Terraform, GitHub Actions
Practices: system design, TDD, observability, on-call

EXPERIENCE
Acme Corp | Senior Backend Engineer | Mar 2021 - Present | Austin, TX
Stack: Go, PostgreSQL, Kafka, AWS
- Led migration of the order service from a monolith to 6 services; p99 latency 800ms -> 440ms.
- Designed an idempotent payment retry pipeline handling 2M events per day.
- Mentored 4 engineers; introduced design reviews.

Globex | Backend Engineer | Jun 2017 - Feb 2021 | Remote
Stack: Python, Django, MySQL, GCP
- Built the reporting API used by 300 enterprise customers.
- Reduced nightly batch runtime from 6h to 50min.

PROJECTS
OpenQueue | Open-source job queue for Go | Stack: Go, Redis
- 1.2k GitHub stars; used in production by 3 companies.

EDUCATION
B.S. Computer Science | University of Texas at Austin | 2017

CERTIFICATIONS
AWS Certified Solutions Architect - Associate | 2023
`;

// Starter Basic Information questions offered for a new resume (empty answers).
export const STARTER_QA_QUESTIONS = [
  "Tell me about yourself.",
  "Why are you leaving your current role?",
  "Why do you want this role?",
  "What are your salary expectations?",
  "What is your notice period?",
  "What is your work authorisation status?",
  "What are your greatest strengths?",
  "What is a weakness you are working on?",
  "Are you open to remote or relocation?",
  "Tell me about a time you handled conflict.",
  "Tell me about a failure and what you learned.",
  "What is the project you are proudest of?",
  "Do you have any questions for us?",
];
