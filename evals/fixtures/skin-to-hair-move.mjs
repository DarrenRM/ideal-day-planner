import { fixture as capturedSkinRoutine } from "./skin-routine-beard-roller.mjs";

const moveMessage = {
  id: "eval-message:move-beard-roller",
  author: "user",
  body: "hey i put this in the wrong spot, can you move it over",
  createdAt: "2026-08-21 21:00:00",
};

const beardRecords = [
  {
    id: "activity-record:skin-routine:kestrel-grooming-beard-grooming-roller",
    key: "kestrel-grooming-beard-grooming-roller",
    type: "product",
    title: "Kestrel Grooming Beard Grooming Roller",
    scope: "activity",
    scopeDate: null,
    version: 1,
    data: {
      kind: "device",
      name: "Beard Grooming Roller",
      manufacturer: "Kestrel Grooming",
      variant: "Replaceable-head model",
      notes: "Purchased by the user.",
    },
  },
  {
    id: "activity-record:skin-routine:beard-grooming-roller-protocol",
    key: "beard-grooming-roller-protocol",
    type: "protocol",
    title: "Beard Grooming Roller Routine",
    scope: "activity",
    scopeDate: null,
    version: 1,
    data: {
      summary: "Weekly beard-roller session.",
      steps: [{ id: "roll-lightly", label: "Make light, even passes", note: "Do not press hard.", completed: false }],
    },
  },
  {
    id: "activity-record:skin-routine:beard-grooming-roller-weekly",
    key: "beard-grooming-roller-weekly",
    type: "recurring_step",
    title: "Weekly Beard Grooming Roller",
    scope: "activity",
    scopeDate: null,
    version: 1,
    data: {
      label: "Use Beard Grooming Roller",
      note: "The user's planned weekly cadence.",
      itemKey: "kestrel-grooming-beard-grooming-roller",
      anchorDate: "2026-08-21",
      cadence: { kind: "weekly", every: 1 },
      completedDates: ["2026-08-21"],
    },
  },
  {
    id: "activity-record:skin-routine:beard-grooming-roller-usage",
    key: "beard-grooming-roller-usage",
    type: "activity_event",
    title: "Beard Grooming Roller Use",
    scope: "activity",
    scopeDate: null,
    version: 1,
    data: {
      entries: [{
        id: "beard-grooming-roller-used-2026-08-21",
        date: "2026-08-21",
        label: "Used Beard Grooming Roller",
        detail: "Used today.",
        itemKey: "kestrel-grooming-beard-grooming-roller",
      }],
    },
  },
  {
    id: "activity-record:skin-routine:beard-grooming-roller-reference",
    key: "beard-grooming-roller-reference",
    type: "resources",
    title: "Beard Grooming Roller Reference",
    scope: "activity",
    scopeDate: null,
    version: 1,
    data: {
      entries: [{
        id: "kestrel-grooming-beard-grooming-roller",
        label: "Kestrel Grooming: Beard Grooming Roller",
        url: "https://kestrelgrooming.example/products/beard-grooming-roller",
        note: "Manufacturer instructions and product details.",
      }],
    },
  },
];

export const fixture = {
  leased: {
    ...capturedSkinRoutine.leased,
    job: {
      ...capturedSkinRoutine.leased.job,
      id: "eval:skin-to-hair-move",
      sourceMessageId: moveMessage.id,
    },
    context: {
      ...capturedSkinRoutine.leased.context,
      activities: [
        { id: "activity:skin-routine", clientKey: "skin-routine", title: "Skin routine", category: "Care" },
        { id: "activity:hair-serum", clientKey: "hair-serum", title: "Hair Routine", category: "Care" },
      ],
      records: [...capturedSkinRoutine.leased.context.records, ...beardRecords],
      workspace: {
        ...capturedSkinRoutine.leased.context.workspace,
        document: {
          version: 1,
          components: [
            ...capturedSkinRoutine.leased.context.workspace.document.components,
            ...beardRecords.map((record) => ({
              id: `${record.key}-card`,
              type: record.type,
              title: record.title,
              recordKey: record.key,
              presentation: "default",
            })),
          ],
        },
      },
      recentMessages: [
        ...capturedSkinRoutine.leased.context.recentMessages,
        { id: "saved-in-wrong-place", author: "luna", body: "I saved the Beard Grooming Roller, your weekly plan, and today's use.", createdAt: "2026-08-21 20:14:00" },
        moveMessage,
      ],
      sourceMessage: moveMessage,
    },
  },
  expectedTargetActivityId: "activity:hair-serum",
  expectedRecordKeys: beardRecords.map((record) => record.key),
};
