const lifecycleSteps = [
  {
    title: "1. Inbound capture",
    body:
      "The system watches the EDU Ops inbox, stores inbound emails involving edu.ops, and links them to the right site, partner, or thread when possible.",
  },
  {
    title: "2. Classification",
    body:
      "Each inbound email is classified into an operational type such as partner scheduling, partner completion, partner question, internal action needed, or unknown.",
  },
  {
    title: "3. Decisioning",
    body:
      "Decision trees decide whether to draft a response, wait for more information, escalate to a human, or simply track the message in context.",
  },
  {
    title: "4. Draft review",
    body:
      "For supervised classes, the agent generates a draft and sends it to the review queue for human approval, editing, or rejection.",
  },
  {
    title: "5. Send and learn",
    body:
      "When a reviewer acts, the system stores the final outcome, edit distance, and edit categories so draft quality can be measured over time.",
  },
];

const labelGroups = [
  {
    title: "Email classifications",
    items: [
      ["partner scheduling", "Partner email about site scheduling, availability, or scheduling blockers."],
      ["partner completion", "Partner email about completed work, deliverables, reports, or job closeout."],
      ["partner question", "Partner request for clarification, next steps, scope, contacts, or logistics."],
      ["partner invoice", "Partner email related to billing or invoice processing."],
      ["internal action needed", "Internal email that likely needs an EDU Ops decision or response."],
      ["internal FYI", "Internal update that is useful context but usually does not need a reply."],
      ["unknown", "The classifier could not confidently place the message. Treat carefully."],
    ],
  },
  {
    title: "Thread states",
    items: [
      ["active", "An active thread with recent movement and no specific blocker state."],
      ["waiting partner", "The last meaningful action is with the external partner. We are waiting on them."],
      ["waiting human", "The agent needs a human decision, approval, or manual intervention."],
      ["escalated", "The thread contains enough risk or ambiguity that normal automation should pause."],
      ["resolved", "The operational question is complete or closed."],
      ["archived", "The thread is not currently actionable and has been set aside."],
    ],
  },
  {
    title: "Draft statuses",
    items: [
      ["pending", "Waiting for a human reviewer."],
      ["approved", "Reviewer sent the agent draft with no meaningful edits."],
      ["edited", "Reviewer changed the draft before sending."],
      ["rejected", "Reviewer decided the draft should not be sent."],
      ["auto sent", "The system sent the draft without human intervention."],
      ["expired", "The draft was no longer valid to send."],
    ],
  },
];

const reviewerActions = [
  {
    title: "Approve and send",
    guidance:
      "Use when the draft is factually correct, addressed to the right people, and safe to send as-is. Small punctuation or whitespace concerns are not a reason to edit.",
  },
  {
    title: "Edit and send",
    guidance:
      "Use when the agent has the right intent but needs correction in tone, factual detail, recipients, scope, commitments, dates, or sequencing.",
  },
  {
    title: "Reject",
    guidance:
      "Use when the draft is pointed at the wrong outcome, should not be sent yet, contains risky assumptions, or the situation needs manual handling first.",
  },
];

const editingRules = [
  "Do not let the agent make commitments about dates, deliverables, or approvals unless the source email or tracked data supports them.",
  "If a partner asks multiple questions, make sure the response addresses each one directly or explicitly says what will be followed up later.",
  "Prefer operational clarity over politeness theater. Short, explicit next steps are usually better than long soft language.",
  "Fix recipients and CCs when necessary. Incorrect routing is more serious than imperfect wording.",
  "Reject instead of editing when the draft is solving the wrong problem. Large rewrites should be treated as a signal that the class, prompt, or decision rule still needs work.",
];

const faqItems = [
  {
    question: "What does pass rate actually mean?",
    answer:
      "A reviewed draft counts as passing when it was not rejected and the stored edit distance is 0.02 or lower. In practice, that means the human reviewer made little or no substantive change.",
  },
  {
    question: "What does 20+ reviews mean?",
    answer:
      "It is only a minimum evidence threshold. It means there is enough reviewed volume to start evaluating a class seriously. It does not mean a class is ready for auto-send by itself.",
  },
  {
    question: "When should we move a class toward autonomy?",
    answer:
      "Only after the class has enough volume, a strong and stable pass rate, low-risk edit patterns, and no recurring failures around commitments, recipients, or missing context.",
  },
  {
    question: "What should reviewers do with recurring edits?",
    answer:
      "Treat recurring edits as product feedback. If the same correction keeps appearing, tighten the prompt, the classification guidance, or the decision tree instead of relying on reviewers forever.",
  },
  {
    question: "What should happen to unknown or ambiguous emails?",
    answer:
      "They should stay under human control. Unknown is a routing problem, not a class you should push toward autonomy quickly.",
  },
];

function sectionTitle(title: string, body?: string) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {body && <p className="mt-1 text-sm text-gray-600 max-w-3xl">{body}</p>}
    </div>
  );
}

export default function DocsPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-10">
      <section className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8">
        <div className="max-w-3xl">
          <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            Operations guide
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-gray-900">
            How the EDU Ops agent works and how reviewers should use it
          </h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            This guide is the shared operating manual for the supervised reply system. Use it to
            understand the workflow, interpret labels in the dashboard, and make consistent
            review decisions while the agent is still learning.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        {sectionTitle(
          "Process overview",
          "The current system is designed for AI drafting with human review. The learning loop depends on reviewers acting consistently."
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {lifecycleSteps.map((step) => (
            <div key={step.title} className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {sectionTitle(
          "Reviewer execution guidance",
          "Use the queue to enforce quality and teach the system what a correct response looks like."
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {reviewerActions.map((action) => (
            <div key={action.title} className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900">{action.title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{action.guidance}</p>
            </div>
          ))}
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-amber-900">Editing rules of thumb</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-900">
            {editingRules.map((rule) => (
              <li key={rule} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-5">
        {sectionTitle(
          "What the labels mean",
          "These are the labels reviewers will see across the dashboard, review queue, and insights views."
        )}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {labelGroups.map((group) => (
            <div key={group.title} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="border-b border-gray-100 px-5 py-4">
                <h3 className="text-sm font-semibold text-gray-900">{group.title}</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {group.items.map(([label, meaning]) => (
                  <div key={label} className="px-5 py-4">
                    <div className="text-sm font-medium text-gray-900">{label}</div>
                    <div className="mt-1 text-sm leading-6 text-gray-600">{meaning}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {sectionTitle(
          "How to interpret the learning metrics",
          "The insights dashboard is for decision quality, not vanity metrics."
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900">What to trust</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-600">
              <li>High pass rate with low edit distance across many reviews is a good sign.</li>
              <li>Common edit categories show where prompts or policies need tightening.</li>
              <li>Examples behind each classification show whether the numbers reflect real quality.</li>
            </ul>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900">What not to over-trust</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-600">
              <li>A small sample with a high pass rate is not enough to justify autonomy.</li>
              <li>Approved as-is counts can hide routing issues if the wrong drafts never reach review.</li>
              <li>Low edit distance does not matter if the draft makes risky commitments or misses context.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {sectionTitle(
          "FAQ",
          "Operational answers for the questions that usually come up when reviewing or interpreting the system."
        )}
        <div className="space-y-3">
          {faqItems.map((item) => (
            <div key={item.question} className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900">{item.question}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
