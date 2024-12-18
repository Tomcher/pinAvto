import fs from "node:fs/promises";
import * as path from "node:path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { parseStringPromise } from "xml2js";
import { z } from "zod";
import { transliterate as tr } from "transliteration";
import { Client } from "@elastic/elasticsearch";
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

export type CacheResolutionType = "search" | "fail" | "skip";

interface ParsedModels {
  Shiny: {
    make: ModelMake[];
  };
}

type ModelMake = {
  $: {
    name: string;
  };
  model: {
    $: {
      name: string;
    };
  }[];
};

const SubstituteDataSchema = z.object({
  makes: z.record(z.string()),
  models: z.record(
    z.object({
      make: z.string().optional(),
      model: z.string().optional(),
    })
  ),
  buzzwords: z.array(z.string()),
});

export class Search {
  public parsedMakes: { BrandValues: { Brand: string[] } } | undefined;
  public parsedModels: ParsedModels | undefined;

  public substitutionData: z.infer<typeof SubstituteDataSchema> = {
    makes: {},
    models: {},
    buzzwords: [],
  };

  public elasticClient: Client;
  constructor() {
    this.elasticClient = new Client({
      node: process.env.ELASTIC_HOST,
      auth: {
        apiKey: process.env.ELASTIC_KEY ?? "",
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  public async init() {
    const makesXmlContent = await fs.readFile(
      path.join(__dirname, "..", "..", "..", "settings", "makes.xml"),
      "utf-8"
    );
    const modelsXmlContent = await fs.readFile(
      path.join(__dirname, "..", "..", "..", "settings", "models.xml"),
      "utf-8"
    );
    this.parsedMakes = await parseStringPromise(makesXmlContent);
    this.parsedModels = await parseStringPromise(modelsXmlContent);
    await this.createIndex();
    await this._generateMakeIndicies();
    await this._generateModelGlobalIndex();
    await this._loadSubstitutionData();
  }
  public async createIndex() {
    const exists = await this.elasticClient.indices.exists({
      index: "avito-tires",
    });

    if (exists) {
      console.log(`Index avito-tires already exists. No action taken.`);
      return;
    }
    try {
      await this.elasticClient.indices.create({
        index: "avito-tires",
        body: {
          settings: {
            analysis: {
              filter: {
                word_delimiter_filter: {
                  type: "word_delimiter",
                  split_on_case_change: true,
                  split_on_numerics: true,
                  preserve_original: true,
                },
              },
              char_filter: {
                punct_filter: {
                  type: "mapping",
                  // Convert hyphens into spaces to ensure consistent tokenization
                  mappings: ["-=> "],
                },
              },
              tokenizer: {
                my_ngram_tokenizer: {
                  type: "ngram",
                  min_gram: 3,
                  max_gram: 4,
                  token_chars: ["letter", "digit"],
                },
              },
              analyzer: {
                my_custom_analyzer: {
                  type: "custom",
                  char_filter: ["punct_filter"],
                  tokenizer: "standard",
                  filter: ["lowercase", "word_delimiter_filter"],
                },
              },
            },
          },
          mappings: {
            properties: {
              model: {
                type: "text",
                analyzer: "standard",
                search_analyzer: "standard",
              },
              modification: {
                type: "text",
                analyzer: "standard",
                search_analyzer: "standard",
              },
              modelTr: {
                type: "text",
                analyzer: "standard",
                search_analyzer: "standard",
              },
              makeModel: {
                type: "text",
                analyzer: "standard",
                search_analyzer: "standard",
              },
              make: {
                type: "text",
                analyzer: "standard",
              },
              type: {
                type: "text",
                analyzer: "standard",
              },
            },
          },
        },
      });

      console.log("Index with custom analyzer created successfully!");
    } catch (error) {
      console.error("Error:", error);
    }
  }

  private async _loadSubstitutionData() {
    const substitutionData = await fs.readFile(
      path.join(__dirname, "..", "..", "..", "settings", "substitutes.json"),
      "utf-8"
    );
    try {
      this.substitutionData = SubstituteDataSchema.parse(
        JSON.parse(substitutionData)
      );
    } catch (e) {
      console.log(" substitute parse error: ", e);
    }
  }

  private _fastClean(str: string, rm: string[]) {
    return rm.reduce((sum, n) => {
      while (sum.indexOf(n) > -1) {
        const i = sum.indexOf(n);
        sum = [sum.slice(0, i), sum.slice(i + n.length)].join("");
      }
      return sum;
    }, str);
  }

  public async checkSubstitutionData(
    make: string,
    model?: string
  ): Promise<{
    make: string;
    model?: string;
  }> {
    let foundMake = make;
    let foundModel =
      this.substitutionData.buzzwords.length > 0 && model
        ? this._fastClean(model, this.substitutionData.buzzwords)
        : model;
    if (this.substitutionData) {
      if (this.substitutionData.makes) {
        const foundKey = Object.keys(this.substitutionData.makes).find(
          (key) => make.toLowerCase().indexOf(key.toLowerCase()) > -1
        );
        if (foundKey) {
          foundMake = this.substitutionData.makes[foundKey];
        }
      }
      if (model && this.substitutionData.models) {
        const foundKey = Object.keys(this.substitutionData.models).find(
          (key) => model.toLowerCase().indexOf(key.toLowerCase()) > -1
        );
        if (foundKey) {
          const found = this.substitutionData.models[foundKey];
          foundMake = found.make ?? foundMake;
          foundModel = found.model ?? foundModel;
        }
      }
    }
    return {
      make: foundMake,
      model: foundModel,
    };
  }

  private async _generateMakeIndicies() {
    if (!this.parsedMakes) {
      return;
    }
    const makes = this.parsedMakes.BrandValues.Brand.map((it: string) =>
      it.trim()
    );
    const docs = makes.map((m) => ({ make: m, type: "make", _id: m }));
    const body = docs.flatMap(({ _id, make, type }) => [
      { index: { _index: "avito-tires", _id } },
      { make, type },
    ]);

    await this.elasticClient.bulk({ body });
  }

  private async _generateModelGlobalIndex() {
    if (!this.parsedModels) {
      return;
    }
    const docs: {
      _id: string;
      make: string;
      model: string;
      modification?: string;
      modelTr: string;
      makeModel: string;
      type: string;
    }[] = [];
    for (const make of this.parsedModels.Shiny.make) {
      for (const model of make.model) {
        const parts = model.$.name.split(" ");
        let modification: string | undefined = undefined;
        if (parts.length > 1) {
          const skip = parts.slice(1);
          const withNum = skip.find((ch) => /\d/.test(ch));
          if (withNum) {
            // console.log("mods: ", model.$.name, " -- ", withNum);
            modification = withNum;
          }
        }
        // console.log("ix: ", model.$.name, " -- ", modification);
        docs.push({
          _id: `${make.$.name}-${model.$.name}`,
          make: make.$.name,
          model: model.$.name,
          modelTr: tr(model.$.name),
          modification,
          makeModel: `${make.$.name} ${model.$.name}`,
          type: "model",
        });
      }
    }
    const body = docs.flatMap(
      ({ _id, make, makeModel, modelTr, model, type, modification }) => [
        { index: { _index: "avito-tires", _id } },
        { make, makeModel, modelTr, model, type, modification },
      ]
    );
    await this.elasticClient.bulk({ body });
  }
  public async searchModel({
    make: initMake,
    model: initModel,
  }: {
    make: string;
    model: string;
  }): Promise<{
    make: string;
    model: string;
    resolution: CacheResolutionType;
  }> {
    const result = await this.elasticClient.search<{
      make: string;
      model: string;
    }>({
      index: "avito-tires",
      body: {
        query: {
          bool: {
            must: [
              { match: { type: "model" } },
              {
                bool: {
                  should: [
                    {
                      multi_match: {
                        query: `${initModel}`,
                        fields: [
                          "model",
                          "modelTr",
                          "makeModel^2",
                          "modification",
                        ],
                        fuzziness: "AUTO",
                      },
                    },
                    {
                      multi_match: {
                        query: `${initModel.replace(/ /, "")}`,
                        fields: [
                          "model",
                          "modelTr",
                          "makeModel^2",
                          "modification",
                        ],
                        fuzziness: "AUTO",
                      },
                    },
                  ],
                },
              },
            ],
            should: [
              {
                multi_match: {
                  query: initMake,
                  fields: ["make^2"],
                  // fuzziness: "1",
                },
              },
            ],
            minimum_should_match: 0,
          },
        },
      },
    });
    if (result && result.hits.hits.length > 0 && result.hits.hits[0]._source) {
      const { make, model } = result.hits.hits[0]._source;
      const second = result.hits.hits[1];
      const diff_score = second ? (result.hits.hits[0]._score ?? 0) - (second._score ?? 0) : 100
      console.log(
        "found: ",
        make,
        model,
        " from: ",
        initMake,
        initModel,
        " score: ",
        result.hits.hits[0]._score,
      );
      if (second && (diff_score < 1 && diff_score > 0)) {
        console.log(
          "    very likely:",
         `${second._source?.make} ${second._source?.model} : ${second._score}, diff: ${diff_score}`
        )
      }
      
      return { make, model, resolution: "search" };
    } else {
      console.log(result, initMake, initModel);
      return { make: "", model: "", resolution: "fail" };
    }
  }
}
