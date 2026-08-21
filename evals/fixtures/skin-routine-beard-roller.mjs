const sourceMessage = {
  id: "message:eval-user:63c8906b-7716-4cd7-8851-fb6a14fcf688",
  author: "user",
  body: "hey i bought this https://kestrelgrooming.example/products/beard-grooming-roller and used it today. i plan to use it once a week as part of my hair routine",
  createdAt: "2026-08-21 20:13:00",
};

export const fixture = {
  capturedAt: "2026-08-21",
  source: "Production D1 read-only snapshot",
  expectedTensions: [
    "The message was sent inside Skin routine but explicitly says it belongs to Hair routine.",
    "The URL should be researched before durable facts are added.",
    "Used today is an occurrence fact; once a week is a recurring substep.",
  ],
  leased: {
    job: {
      id: "eval:skin-routine-beard-roller",
      kind: "workspace_refresh",
      attempts: 1,
      sourceMessageId: sourceMessage.id,
    },
    context: {
      activity: {
        clientKey: "skin-routine",
        title: "Skin routine",
        category: "Care",
      },
      schedule: {
        planDate: "2026-08-21",
        timelineEnabled: false,
        duration: null,
      },
      activityContext: null,
      occurrence: null,
      activityVariantId: null,
      workspace: {
        revisionId: "workspace-revision:agent-job_3Aeval-user_3Aworkspace_3Aagent-job_3Aeval-user_3Amessage_3A1b30f873-8f2d-497a-a08e-cd0b31b81f40",
        revisionNumber: 1,
        document: {
          version: 1,
          components: [
            { id: "castile-soap-product", type: "product", title: "Castile Soap", recordKey: "castile-soap", presentation: "default" },
            { id: "castile-soap-references", type: "resources", title: "Castile Soap References", recordKey: "castile-soap-references", presentation: "compact" },
          ],
        },
      },
      records: [
        {
          id: "activity-record:skin-routine:castile-soap",
          key: "castile-soap",
          type: "product",
          title: "Castile Soap",
          scope: "activity",
          scopeDate: null,
          version: 1,
          data: {
            kind: "product",
            name: "Castile Soap",
            manufacturer: "",
            variant: "",
            notes: "Traditional Castile soap is made from olive oil. Many makers add other oils, such as coconut, so formulas differ.",
          },
          updatedAt: "2026-08-20 20:14:34",
        },
        {
          id: "activity-record:skin-routine:castile-soap-references",
          key: "castile-soap-references",
          type: "resources",
          title: "Castile Soap References",
          scope: "activity",
          scopeDate: null,
          version: 1,
          data: {
            entries: [
              {
                id: "guide-castile-soap",
                label: "Guide: Traditional Castile Soap",
                url: "https://soap-guide.example/castile-soap",
                note: "Background on traditional olive-oil soapmaking.",
              },
            ],
          },
          updatedAt: "2026-08-20 20:14:34",
        },
      ],
      recentRuns: [
        { planDate: "2026-08-21", status: "completed", allottedDurationSeconds: null, plannedDurationSeconds: null, actualElapsedSeconds: null, timerMode: null, startedAt: null, completedAt: "2026-08-21 15:48:56", detailsJson: "{\"recordVersions\":[{\"key\":\"castile-soap\",\"type\":\"product\",\"version\":1},{\"key\":\"castile-soap-references\",\"type\":\"resources\",\"version\":1}]}" },
        { planDate: "2026-08-20", status: "completed", allottedDurationSeconds: null, plannedDurationSeconds: null, actualElapsedSeconds: null, timerMode: null, startedAt: null, completedAt: "2026-08-20 23:39:21", detailsJson: "{\"recordVersions\":[{\"key\":\"castile-soap\",\"type\":\"product\",\"version\":1},{\"key\":\"castile-soap-references\",\"type\":\"resources\",\"version\":1}]}" },
      ],
      recentMessages: [
        { id: "setup-message", author: "luna", body: "Which products or steps should this routine include, and in what order?", createdAt: "2026-08-20 19:49:26" },
        { id: "castile-user", author: "user", body: "Castile Soap, you can look it up", createdAt: "2026-08-20 19:49:42" },
        { id: "castile-ack", author: "luna", body: "Castile soap is traditionally an olive-oil cleansing bar, though many makers add other oils and formulas vary. I’ll use Castile Soap as the named product for this routine and leave its exact step open until you confirm how you use it.", createdAt: "2026-08-20 19:50:54" },
        { id: "castile-research", author: "luna", body: "I checked: The guide describes traditional Castile soap as being made with olive oil. Many makers add other oils and the exact formula varies, so I left its place in your skin routine open.", createdAt: "2026-08-20 20:14:34" },
        sourceMessage,
        { id: "beard-roller-ack", author: "luna", body: "I’ll take a look and keep the useful details with your skin routine.", createdAt: "2026-08-21 20:13:02" },
      ],
      sourceMessage,
    },
  },
};
