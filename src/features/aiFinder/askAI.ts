import { Ollama } from "ollama";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const ollama = new Ollama({ host: "https://ollama.empireshq.com" });

const SKUSchema = z.object({
  matched_tire: z.string().or(z.null()).describe("Found tire model "),
  similarity_score: z.number().optional()
});

const failCache: {[key in string]: number} = {};

export const askAI = async (search: string, list: string[]): Promise<z.infer<typeof SKUSchema>> => {
  if (failCache[search] && failCache[search] > 1) {
    return {
      matched_tire: null
    }
  }
  const jsonSchema = zodToJsonSchema(SKUSchema);
  // console.log('schema: ', JSON.stringify(jsonSchema))
  const msg = `
You are given a target tire model name and a list of available tire model names. Your task is to find the available model name that most closely matches the target model name in a human-intuitive manner (e.g., considering slight spelling differences, minor variations, missing hypens, dashes, ending numbers or abbreviations). If no close or plausible match exists in the given list, you should return null.

Instructions:
1. Do not invent or hallucinate any tire models that are not in the provided list.
2. Identify the single model from the list that best matches the target name. If you are not sure or the match is weak, return null.
3. Do not change found match collation
4. Return your final answer in JSON format

Input:
Target tire model: "${search}"

List of available models:
[${list.map(i => `"${i}"`).join(",")}]

`;
  console.log('asking: ', msg)
  const response = await ollama.chat({
    model: "llama3.2:1b-instruct-fp16",
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant.",
      },
      {
        role: "user",
        content: msg,
      },
    ],
    format: jsonSchema,
    options: {
      temperature: 0, // Make responses more deterministic
    },
  });
  const res = SKUSchema.parse(JSON.parse(response.message.content));
  if (!res.matched_tire) {
    failCache[search] ??= 0
    failCache[search]+=1
  }
  return res
};