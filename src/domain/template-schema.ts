import { z } from "zod";
import { ChangeTypeSchema, OwnerSchema, RiskSchema } from "./types";

/**
 * Schema for a task template (formula): reusable structure that can be applied
 * to create one or more tasks. Fields align with Task where applicable.
 */
export const TaskTemplateSchema = z.object({
  /** Template identifier (slug). */
  name: z.string().min(1).max(64),
  /** Optional short description of when to use this template. */
  description: z.string().max(512).optional(),
  /** Task title; may contain placeholders for variable substitution. */
  title: z.string().min(1).max(255),
  /** Optional intent text. */
  intent: z.string().max(2048).optional(),
  /** Optional scope-in. */
  scope_in: z.string().max(2048).optional(),
  /** Optional scope-out. */
  scope_out: z.string().max(2048).optional(),
  /** Optional acceptance criteria. */
  acceptance: z.array(z.string().max(512)).optional(),
  /** Default task owner. */
  owner: OwnerSchema.default("agent"),
  /** Default risk. */
  risk: RiskSchema.default("low"),
  /** Optional change type. */
  change_type: ChangeTypeSchema.optional(),
});

export type TaskTemplate = z.infer<typeof TaskTemplateSchema>;
