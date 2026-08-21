export function messageHasScheduleIntent(value: string) {
  const embeddedStepCadence = /\b(?:daily|weekly|once\s+(?:a|per)\s+week|every\s+(?:other|day|week)|weekdays?)\b[\s\S]{0,120}\b(?:as\s+part\s+of|within|inside)\b|\b(?:as\s+part\s+of|within|inside)\b[\s\S]{0,120}\b(?:daily|weekly|once\s+(?:a|per)\s+week|every\s+(?:other|day|week)|weekdays?)\b/i.test(value);
  if (embeddedStepCadence) return false;
  return /\b(?:schedule|reschedule|recurr|daily|weekly|once\s+(?:a|per)\s+week|every\s+(?:other|day|week)|weekdays?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|alternate|rotate|rotation|move\s+(?:this|it|all|every)|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|future\s+(?:session|occurrence|day))\b/i.test(value);
}
