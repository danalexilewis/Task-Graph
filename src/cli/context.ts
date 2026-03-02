import type { Command } from "commander";
import { TgClient } from "../api";
import type { AppError } from "../domain/errors";
import { rootOpts } from "./utils";

export function contextCommand(program: Command) {
  program
    .command("context")
    .description(
      "Output doc paths, skill guide paths, and related done tasks for a task (run before starting work)",
    )
    .argument("<taskId>", "Task ID")
    .action(async (taskId, _options, cmd) => {
      const client = new TgClient();
      const result = await client.context(taskId);

      result.match(
        (d) => {
          const tokenCount = d.token_estimate;
          const charCount = JSON.stringify(d).length;
          if (rootOpts(cmd).json) {
            console.log(JSON.stringify(d, null, 2));
            return;
          }
          console.log(`Task: ${d.title} (${d.task_id})`);
          if (d.agent) console.log(`Agent: ${d.agent}`);
          if (d.change_type) console.log(`Change type: ${d.change_type}`);
          if (d.plan_name) {
            const overviewSnippet = d.plan_overview
              ? ` — ${d.plan_overview.split("\n")[0].slice(0, 120)}`
              : "";
            console.log(`Project: ${d.plan_name}${overviewSnippet}`);
          }
          d.doc_paths.forEach((p) => {
            console.log(`Doc: ${p}`);
          });
          d.skill_docs.forEach((doc) => {
            console.log(`Skill guide: ${doc}`);
          });
          if (d.suggested_changes) {
            console.log(`Suggested changes:`);
            console.log(d.suggested_changes);
          }
          if (d.file_tree) {
            console.log(`Project file tree:`);
            console.log(d.file_tree);
          }
          if (d.risks != null && Array.isArray(d.risks) && d.risks.length > 0) {
            console.log(`Project risks:`);
            d.risks.forEach(
              (r: {
                description?: string;
                severity?: string;
                mitigation?: string;
              }) => {
                console.log(
                  `  - ${r.severity ?? "?"}: ${r.description ?? ""} (${r.mitigation ?? ""})`,
                );
              },
            );
          }
          if (d.immediate_blockers.length > 0) {
            console.log(`Immediate blockers:`);
            d.immediate_blockers.forEach((b) => {
              const ev = b.evidence ? ` [evidence: ${b.evidence}]` : "";
              console.log(`  ${b.task_id}  ${b.title} (${b.status})${ev}`);
            });
          }
          console.log(`[context: ~${charCount} chars, ~${tokenCount} tokens]`);
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
