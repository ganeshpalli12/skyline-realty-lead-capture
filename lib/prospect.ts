/**
 * Maps the camelCase input keys accepted by /api/agent/create-prospect and
 * /api/agent/update-prospect to their Salesforce custom field API names
 * on the Prospect__c object.
 */
export const PROSPECT_INPUT_TO_SF: Record<string, string> = {
  firstName: "First_Name__c",
  lastName: "Last_Name__c",
  salutation: "Salutation__c",
  company: "Company__c",
  designation: "Designation__c",
  email: "Email__c",
  mobile: "Mobile__c",
  whatsAppNumber: "WhatsApp_Number__c",
  industry: "Industry__c",
  location: "Location__c",
  source: "Source__c",
  status: "Status__c",
  bantBudget: "BANT_Budget__c",
  bantAuthority: "BANT_Authority__c",
  bantNeed: "BANT_Need__c",
  bantTimeline: "BANT_Timeline__c",
  responseDate: "Response_Date__c",
  responseNotes: "Response_Notes__c",
  notes: "Notes__c",
};

/**
 * Build a Salesforce-field-name → value object from the caller-supplied
 * camelCase keys, skipping null / undefined / empty-string values.
 * Returns the SF payload object plus a list of input keys that were
 * rejected (unknown).
 */
export function buildProspectSfPayload(input: Record<string, unknown>): {
  payload: Record<string, unknown>;
  rejectedKeys: string[];
} {
  const payload: Record<string, unknown> = {};
  const rejectedKeys: string[] = [];

  for (const [inputKey, value] of Object.entries(input)) {
    const sfField = PROSPECT_INPUT_TO_SF[inputKey];
    if (!sfField) {
      rejectedKeys.push(inputKey);
      continue;
    }
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    payload[sfField] = typeof value === "string" ? value.trim() : value;
  }

  return { payload, rejectedKeys };
}
