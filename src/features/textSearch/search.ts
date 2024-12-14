import fs from "node:fs/promises";
import * as path from "node:path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { parseStringPromise } from "xml2js";
import flexsearch from "flexsearch";
import { askAI } from "../aiFinder/askAI";
import { z } from "zod";
import { transliterate as tr } from "transliteration";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

type SearchOpts = {
  useAI: boolean;
  useCache: boolean;
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

  public makeIndex: flexsearch.Index;
  public makeStore: string[] = [];

  public modelGlobalStore: Array<{ model: string; make: string }> = [];
  public modelGloblIndex: flexsearch.Index;

  public makeCache: { [key in string]: string } = {};

  //{
  //  kama: {
  //    "Кама Grant (HK-241)": {
  //      make: "KAMA",
  //      model: "Кама Grant (HK-241)"
  //    }
  //  }
  //}
  public modelCache: {
    [key in string]: {
      [key in string]: {
        make: string;
        model: string;
      };
    };
  } = {};

  public modelIndicies: {
    [key in string]: { ix: flexsearch.Index; store: string[]; make: string };
  } = {};

  public useAI: boolean;
  public useCache: boolean;
  constructor({ useAI, useCache }: SearchOpts) {
    this.useAI = useAI;
    this.useCache = useCache;
    this.modelGloblIndex = new flexsearch.Index({
      tokenize: "full",
      charset: "advanced",
      resolution: 9,
    });
    this.makeIndex = new flexsearch.Index({
      tokenize: "full",
      charset: "advanced",
      context: true,
      resolution: 9,
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
    await this._generateMakeIndicies();
    await this._generateModelIndicies();
    await this._generateModelGlobalIndex();
    await this._loadSubstitutionData();
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
    makes.forEach((make, i) => {
      this.makeIndex.add(i, make);
      this.makeIndex.add(i, tr(make));
      this.makeStore.push(make);
    });
  }

  private async _generateModelGlobalIndex() {
    if (!this.parsedModels) {
      return;
    }
    let cursor = 0;
    this.parsedModels.Shiny.make.forEach((make) => {
      for (const model of make.model) {
        this.modelGloblIndex.add(cursor, model.$.name);
        this.modelGloblIndex.add(cursor, tr(model.$.name));
        this.modelGloblIndex.add(cursor, `${make.$.name} ${model.$.name}`);
        this.modelGlobalStore.push({
          make: make.$.name,
          model: model.$.name,
        });
        cursor += 1;
      }
    });
  }

  private async _generateModelIndicies() {
    if (!this.parsedModels) {
      return;
    }
    this.modelIndicies = this.parsedModels.Shiny.make.reduce<{
      [key in string]: { ix: flexsearch.Index; store: string[]; make: string };
    }>((sum, n) => {
      const ix = new flexsearch.Index({
        tokenize: "full",
        charset: "extra",
        resolution: 9,
      });
      sum[n.$.name] = {
        store: [],
        ix,
        make: n.$.name,
      };
      n.model.forEach((m, i) => {
        const nameOrig = m.$.name;
        const name = nameOrig.toLowerCase();
        ix.add(i, name);
        ix.add(i, tr(name));
        ix.add(i, `${n.$.name.toLowerCase()} ${name}`);
        sum[n.$.name].store.push(nameOrig);
      });
      return sum;
    }, {});
  }

  public async wideSearch(model: string, searchWide: boolean = false) {
    const found = this.modelGloblIndex.search(model.toLowerCase());
    if (found && found.length > 0) {
      return found.map((index) => this.modelGlobalStore[index as number]);
    }
    if (searchWide) {
      const split = model.split(" ");
      if (split.length > 0) {
        for (let i = 0; i < split.length - 1; i += 1) {
          const slice = split.slice(i).join(" ");
          const sf = this.modelGloblIndex.search(slice);
          if (sf && sf.length) {
            return sf.map((index) => this.modelGlobalStore[index as number]);
          }
        }
      }
    }
  }

  public async searchModel({
    make: initMake,
    model: initModel,
    wideSearch = true,
    skipCache = false,
    partialSerch = true,
  }: {
    make: string;
    model: string;
    wideSearch: boolean;
    skipCache: boolean;
    partialSerch: boolean;
  }): Promise<{ make: string; model: string }> {
    if (
      !skipCache &&
      this.modelCache[initMake] &&
      this.modelCache[initMake][initModel]
    ) {
      return this.modelCache[initMake][initModel];
    }
    const { make, model = initModel } = await this.checkSubstitutionData(
      initMake,
      initModel
    );
    const foundIx = this.modelIndicies[make];
    if (foundIx) {
      const { ix, store } = foundIx;
      const simpleSearch = store.find((s) => s === model);
      if (simpleSearch) {
        console.log("simple: ", model);
        if (!skipCache) {
          this.modelCache[make] ??= {};
          this.modelCache[make][model] = { make, model: simpleSearch };
        }
        return {
          make,
          model: simpleSearch,
        };
      }
      const found = ix.search(model);
      if (found && found.length) {
        console.log("found: ", store[found[0] as number], " : ", model);
        if (!skipCache) {
          this.modelCache[make] ??= {};
          this.modelCache[make][model] = {
            make,
            model: store[found[0] as number],
          };
        }
        return {
          make,
          model: store[found[0] as number],
        };
      }
      if (partialSerch) {
        const split = model.split(" ");
        if (split.length > 1) {
          console.log("  partial search: ", model);
          let cursor = 0;
          while (cursor < split.length - 2) {
            const part = split.slice((cursor += 1));
            console.log("  seaching for :", part.join(" "));
            const fp = ix.search(part.join(" "));
            if (fp && fp.length) {
              console.log(
                "  partial found: ",
                store[fp[0] as number],
                " : ",
                model
              );
              if (!skipCache) {
                this.modelCache[make] ??= {};
                this.modelCache[make][model] = {
                  make,
                  model: store[fp[0] as number],
                };
              }
              return {
                make,
                model: store[fp[0] as number],
              };
            }
          }
        }
      }
      if (wideSearch) {
        const entries = await this.wideSearch(model, wideSearch);
        console.log("found with wide search: ", entries);
        if (entries && entries.length) {
          if (!skipCache) {
            this.modelCache[make] ??= {};
            this.modelCache[make][model] = {
              make,
              model: entries[0].model,
            };
          }
          return entries[0];
        }
      }

      if (this.useAI) {
        console.log("+++ search with AI");
        const modelSplit = model.toLowerCase().split(" ");
        const minimalStore = store
          .map((s) => s.toLowerCase())
          .filter(
            (i) =>
              i.split(" ").filter((ip) => modelSplit.includes(ip)).length > 0
          );
        const resp = await askAI(
          model.toLowerCase(),
          minimalStore.length > 5 ? minimalStore : store
        );
        if (resp.matched_tire) {
          console.log("AI FOUND!!!: ", resp, " : ", model, minimalStore, make);
          console.log("verifying hallucianates...");
          const verify = ix.search(resp.matched_tire);
          if (verify && verify.length > 0) {
            if (!skipCache) {
              this.modelCache[make] ??= {};
              this.modelCache[make][model] = {
                make,
                model: store[verify[0] as number],
              };
            }
            return {
              make,
              model: store[verify[0] as number],
            };
          } else {
            console.log("AI NOT FOUND: ", resp, model, store);
          }
        }
      }
    }

    console.log("not found: ", model, " : ", make);
    return { make, model };
  }

  public async searchMake(initMake: string) {
    if (this.makeCache[initMake]) {
      return this.makeCache[initMake];
    }
    const { make } = await this.checkSubstitutionData(initMake);
    let found = this.makeIndex.search(make);
    if (!found || !found.length) {
      const split = make.split(" ");
      if (split.length > 0) {
        for (const chunk of split) {
          found = this.makeIndex.search(chunk);
          if (found && found.length) {
            return this.makeStore[found[0] as number];
          }
        }
      }
      return make;
    } else {
      return this.makeStore[found[0] as number];
    }
  }
}
