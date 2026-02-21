import 'dotenv/config';
import { ask } from './askCore.js';

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
        : Number(process.env.LLM_TEMPERATURE ?? 0.2);

    const queryEnrichment = process.env.QUERY_ENRICHMENT;

    const out = await ask(question, {
        temperature,
        topK: Number(process.env.TOP_K ?? 3),
        queryEnrichment,
    });

    console.log('\nSources:', out.sources);
    console.log('\nAnswer:\n', out.answer);
    console.log('\nConfidence:', out.confidence);
    if (out.assumptions?.length) console.log('Assumptions:', out.assumptions);
    console.log('\nMeta:', out.meta);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});