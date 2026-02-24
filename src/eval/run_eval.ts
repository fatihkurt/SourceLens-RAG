import { runAnswers } from './run_answers.js';

async function main() {
  const datasetPath = process.argv[2];
  await runAnswers(datasetPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

