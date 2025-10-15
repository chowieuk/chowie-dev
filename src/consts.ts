import { z } from "zod";
import { runColorFill } from "./lib/fractavibes/colorfill";
import { runDLA } from "./lib/fractavibes/dla";
import { runInkDrop } from "./lib/fractavibes/inkdrop";
import { runSpiral } from "./lib/fractavibes/spiral";
export const SITE_TITLE = "CHowie.dev";
export const SITE_DESCRIPTION = "The Dev Log of Christopher Howie";

export const algorithms = {
  dla: runDLA,
  colorfill: runColorFill,
  spiral: runSpiral,
  inkdrop: runInkDrop,
} as const;

export type AlgorithmName = keyof typeof algorithms;

export const AlgorithmNameSchema = z.enum(
  Object.keys(algorithms) as [AlgorithmName, ...AlgorithmName[]],
);

export const algorithmNames = Object.keys(algorithms) as AlgorithmName[];

export function randomAlgorithm() {
  return algorithmNames[Math.floor(Math.random() * algorithmNames.length)];
}
