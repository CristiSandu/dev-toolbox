import vkbeautify from "vkbeautify";

export function formatXml(input: string): string {
  return vkbeautify.xml(input);
}
