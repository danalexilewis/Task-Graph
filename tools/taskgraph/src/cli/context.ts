import { Command } from "commander";
import { readConfig, Config, rootOpts } from "./utils";
import { ResultAsync, errAsync } from "neverthrow";
import { AppError, buildError, ErrorCode } from "../domain/errors";
import { query } from "../db/query";
import { sqlEscape } from "../db/escape";

export function contextCommand(program: Command) {
  program
    .command("context")
    .description(
      "Output domain doc path, skill guide path, and related done tasks for a task (run before starting work)",
    )
    .argument("<taskId>", "Task ID")
    .action(async (taskId, options, cmd) => {
      const result = await readConfig().asyncAndThen((config: Config) => {
        const q = query(config.doltRepoPath);
        return q
          .select<{
            task_id: string;
            title: string;
            domain: string | null;
            skill: string | null;
            change_type: string | null;
          }>("task", {
            columns: ["task_id", "title", "domain", "skill", "change_type"],
            where: { task_id: taskId },
          })
          .andThen((rows) => {
            if (rows.length === 0) {
              return errAsync(
                buildError(
                  ErrorCode.TASK_NOT_FOUND,
                  `Task ${taskId} not found`,
                ),
              );
            }
            const task = rows[0];
            const domain = task.domain ?? null;
            const skill = task.skill ?? null;
            const domainDoc = domain ? `docs/${domain}.md` : null;
            const skillDoc = skill ? `docs/skills/${skill}.md` : null;

            const domainTasksSql =
              domain != null
                ? `SELECT task_id, title, plan_id FROM \`task\` WHERE \`domain\` = '${sqlEscape(domain)}' AND status = 'done' AND task_id != '${sqlEscape(taskId)}' ORDER BY updated_at DESC LIMIT 5`
                : null;
            const skillTasksSql =
              skill != null
                ? `SELECT task_id, title, plan_id FROM \`task\` WHERE \`skill\` = '${sqlEscape(skill)}' AND status = 'done' AND task_id != '${sqlEscape(taskId)}' ORDER BY updated_at DESC LIMIT 5`
                : null;

            const runDomain = domainTasksSql
              ? q.raw<{ task_id: string; title: string; plan_id: string }>(
                  domainTasksSql,
                )
              : ResultAsync.fromSafePromise(Promise.resolve([]));
            const runSkill = skillTasksSql
              ? q.raw<{ task_id: string; title: string; plan_id: string }>(
                  skillTasksSql,
                )
              : ResultAsync.fromSafePromise(Promise.resolve([]));

            return runDomain.andThen((relatedByDomain) =>
              runSkill.map((relatedBySkill) => ({
                task_id: task.task_id,
                title: task.title,
                domain,
                skill,
                change_type: task.change_type ?? null,
                domain_doc: domainDoc,
                skill_doc: skillDoc,
                related_done_by_domain: relatedByDomain,
                related_done_by_skill: relatedBySkill,
              })),
            );
          });
      });

      result.match(
        (data: unknown) => {
          const d = data as {
            task_id: string;
            title: string;
            domain: string | null;
            skill: string | null;
            change_type: string | null;
            domain_doc: string | null;
            skill_doc: string | null;
            related_done_by_domain: Array<{
              task_id: string;
              title: string;
              plan_id: string;
            }>;
            related_done_by_skill: Array<{
              task_id: string;
              title: string;
              plan_id: string;
            }>;
          };
          if (rootOpts(cmd).json) {
            console.log(JSON.stringify(d, null, 2));
            return;
          }
          console.log(`Task: ${d.title} (${d.task_id})`);
          if (d.change_type) console.log(`Change type: ${d.change_type}`);
          if (d.domain_doc) console.log(`Domain doc: ${d.domain_doc}`);
          if (d.skill_doc) console.log(`Skill guide: ${d.skill_doc}`);
          if (d.related_done_by_domain.length > 0) {
            console.log(`Related done (same domain):`);
            d.related_done_by_domain.forEach((t) =>
              console.log(`  ${t.task_id}  ${t.title}`),
            );
          }
          if (d.related_done_by_skill.length > 0) {
            console.log(`Related done (same skill):`);
            d.related_done_by_skill.forEach((t) =>
              console.log(`  ${t.task_id}  ${t.title}`),
            );
          }
        },
        (error: AppError) => {
          console.error(`Error: ${error.message}`);
          if (rootOpts(cmd).json) {
            console.log(
              JSON.stringify(
                { status: "error", message: error.message },
                null,
                2,
              ),
            );
          }
          process.exit(1);
        },
      );
    });
}
