import { ask } from './askCore.js';
import { config } from './core/config.js';
import { extractEntityCandidates } from './core/entityExtract.js';

async function main() {
    const args = process.argv.slice(2);

    const question = (args[0] ?? '').trim();
    if (!question) {
        console.log('Usage: node ask.js "<question>" [temperature]');
        process.exit(1);
    }

    const tempArg = args[1];
    const temperature = tempArg && Number(tempArg) > 0 && Number(tempArg) <= 1
        ? Number(tempArg)
        : Number(config.llm.temperature);

    const queryEnrichment = config.query.enrichment;
    const entityCandidates = extractEntityCandidates(question);
    const debug = Boolean(config.eval.mode);

    const out = await ask(question, {
        temperature,
        topK: Number(config.retrieval.topK),
        topN: Number(config.retrieval.topN),
        entityCandidates,
        debug,
        queryEnrichment,
        contextDebug: debug,
    });

    console.log('\nSources:', out.sources);
    console.log('\nAnswer:\n', out.answer);
    console.log('\nConfidence:', out.confidence);
    if (out.assumptions?.length) console.log('Assumptions:', out.assumptions);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
