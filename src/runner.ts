import { compileTiresToFile } from "./features/compileTiresToFile/compileTiresToFile.js";
const links = [
  "OtherTyresVIP.xml",
  "SummerTyresVIP.xml",
  "TyresVIP.xml",
  "WinterSNGTyresVIP.xml",
  "WinterTyresVIP.xml",
];

(async () => {
  await compileTiresToFile(links, "CompiledTires.xml");
})();
