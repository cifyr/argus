import type { Db, Person } from "./db.js";
import { extractField } from "./ollama.js";
import { matchFriendName } from "./findmy.js";
import { logger } from "./logger.js";

// The intake conversation: one question per SMS. Step index maps to the field being collected.
export const STEPS = [
  { field: "name", ask: (_svc: string) => `What's your full name?` },
  { field: "medical", ask: () => `Any medical conditions we should know about (e.g., diabetes, asthma, heart condition)? Reply "none" if not.` },
  { field: "allergies", ask: () => `Any allergies (medications, food, etc.)? Reply "none" if not.` },
  { field: "medications", ask: () => `Any medications you take regularly? Reply "none" if not.` },
  { field: "emergency_contact", ask: () => `Who is your emergency contact? Reply with their name and phone number.` },
] as const;

export interface IntakeResult { reply: string | null; done: boolean }

// Advance a person's intake using their latest answer; returns the next question to send (or null).
export async function advanceIntake(db: Db, model: string, serviceName: string, person: Person, answer: string): Promise<IntakeResult> {
  let step = person.intake_step;

  // If we've already asked step N (fields[step-1]) store the answer for it.
  if (step > 0 && step <= STEPS.length) {
    const prev = STEPS[step - 1]!;
    if (prev.field === "name") {
      const nm = answer.trim();
      const friend = matchFriendName(nm);
      db.updatePerson(person.phone, friend ? { name: nm, findmy_name: friend } : { name: nm });
      if (friend) logger.info("intake.findmy_matched", { phone: person.phone, friend });
    } else {
      const value = await extractField(model, prev.field, answer);
      db.updatePerson(person.phone, { [prev.field]: value } as Partial<Person>);
      logger.info("intake.stored", { phone: person.phone, field: prev.field, value });
    }
  }

  if (step >= STEPS.length) {
    // Completed
    const fresh = db.getPerson(person.phone)!;
    const parts = [
      fresh.medical && `conditions: ${fresh.medical}`,
      fresh.allergies && `allergies: ${fresh.allergies}`,
      fresh.medications && `medications: ${fresh.medications}`,
      fresh.emergency_contact && `emergency contact: ${fresh.emergency_contact}`,
    ].filter(Boolean);
    const summary = parts.length ? parts.join("; ") + "." : "No medical details on file.";
    db.updatePerson(person.phone, { intake_done: 1, notes: summary });
    return { reply: `Thanks${fresh.name ? `, ${fresh.name.split(" ")[0]}` : ""}. ${findMyReminder()}`, done: true };
  }

  const next = STEPS[step]!;
  db.updatePerson(person.phone, { intake_step: step + 1 });
  return { reply: next.ask(serviceName), done: false };
}

// First contact ("join"): welcome, send the Find My location request, and ask the first detail.
export function firstQuestion(serviceName: string): string {
  return `You're now registered with the ${serviceName} help line. Two things:\n\n` +
    `1) Please SHARE YOUR LOCATION with us now in Find My: open Find My > People > Share My Location, and share with this number. That lets us find you fast in an emergency, even if you move.\n\n` +
    `2) So we can help you best, what's your full name?`;
}

// Optional reminder appended when intake completes.
export function findMyReminder(): string {
  return `You're all set. If you haven't yet, please share your location with us in Find My so we can locate you in an emergency. Just text us anytime you need help.`;
}
