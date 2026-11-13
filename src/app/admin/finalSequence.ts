"use client";
// Candy Island final suspense sequence.
//
// Once only a few campers are still waiting for a marshmallow, this reveals the
// remaining SAFE campers automatically, one tag at a time, and stops with only
// the predetermined at-risk campers (the latest draw's left-overs) unrevealed.
//
// It never decides who is eliminated: that was fixed by the draw. It only
// shuffles the order the safe campers are revealed in. It reuses the stage's
// own marshmallow toss (give) and safe state; it has no player state of its own.

import { useCallback, useEffect, useRef, useState } from "react";

/** The sequence ends with exactly this many campers left unsafe. */
export const FINAL_AT_RISK = 2;
/** It can start once this many (or fewer) campers are unsafe... and at least FINAL_AT_RISK + 1. */
export const MIN_UNSAFE_TO_START = FINAL_AT_RISK + 1;

/**
 * Regroups: when this many (or fewer) campers are still waiting, everyone else
 * fades and they gather in the middle. Happens at 6, then again at 3.
 */
export const REGROUP_AT = [6, 3];
export const REGROUP_MS = 1500;   // fade + slide into the triangle (matches the CSS transitions)
export const COUNTDOWN_STEP_MS = 850; // each of 3, 2, 1

export const DIM_FADE_MS = 250;
export const RIG_MOVE_MS = 500; // arm/tag moving between positions (matches the CSS transition)
export const TOSS_MS = 750;     // the stage's existing marshmallow toss

/**
 * Quick at the start, slower as fewer campers remain. `unsafe` = campers still
 * waiting, before this reveal. flipMs = the whole tag flip (slowest for the last name).
 */
export function timingFor(unsafe: number) {
  if (unsafe <= 3) return { stageHold: 2000, hiddenHold: 1400, nameHold: 2200, safeHold: 1500, flipMs: 1800 }; // last reveal
  if (unsafe === 4) return { stageHold: 1500, hiddenHold: 700, nameHold: 1600, safeHold: 1300, flipMs: 800 };
  if (unsafe <= 6) return { stageHold: 700, hiddenHold: 400, nameHold: 1200, safeHold: 800, flipMs: 420 };
  return { stageHold: 300, hiddenHold: 300, nameHold: 1000, safeHold: 400, flipMs: 320 };
}

/**
 * Arm/tag positions; CSS slides between them.
 * below: both out of frame under the stage · hold: arm has carried the tag to the middle
 * release: tag stays, arm sinks back out · exit: tag drops out too.
 */
export type RigPos = "below" | "hold" | "release" | "exit";

export interface SequenceScene {
  dim: boolean;               // dark overlay over the stage
  rig: RigPos | null;         // null = arm/tag not shown
  camperId: string | null;    // whose tag it is
  side: "back" | "front";     // tag-bottom.png (hidden) or tag-top.png (name)
  flipClosed: boolean;        // mid-flip: tag squashed to zero width
  spotlightId: string | null; // camper drawn above the dim while their marshmallow lands
  flipMs: number;             // how long this tag's flip takes
  countdown: number | null;   // 3, 2, 1 before it starts
}

const IDLE: SequenceScene = { dim: false, rig: null, camperId: null, side: "back", flipClosed: false, spotlightId: null, flipMs: 320, countdown: null };

export interface SequenceInput {
  /** Campers in this ceremony: active, on a stump, not out in an earlier round. */
  participants: string[];
  /** Predetermined at-risk campers (the latest draw's left-overs). */
  atRisk: string[];
  /** Who has a marshmallow right now (the stage's real state). */
  safe: Set<string>;
  nameOf: (id: string) => string;
}

/** Why the sequence can't start right now, or null if it can. */
export function validateSequence({ participants, atRisk, safe, nameOf }: SequenceInput): string | null {
  if (atRisk.length === 0) return "Run a Candy Island draw first: its left-over players are the ones at risk.";
  if (atRisk.length !== FINAL_AT_RISK) {
    return `The latest draw left ${atRisk.length} player${atRisk.length === 1 ? "" : "s"} at risk; the animation needs exactly ${FINAL_AT_RISK}.`;
  }
  const inCeremony = new Set(participants);
  for (const id of atRisk) {
    if (!inCeremony.has(id)) return `${nameOf(id)} is at risk but isn't on a stump in this ceremony (inactive, removed, or out in an earlier round).`;
    if (safe.has(id)) return `${nameOf(id)} is predetermined to be at risk but already has a marshmallow. Take it back first.`;
  }
  const unsafe = participants.filter((id) => !safe.has(id));
  if (unsafe.length < MIN_UNSAFE_TO_START) {
    return `Needs at least ${MIN_UNSAFE_TO_START} campers still waiting for a marshmallow (now ${unsafe.length}).`;
  }
  return null;
}

class Cancelled extends Error {}

/** A wait that ends early (and stops the run) when the sequence is cancelled. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Cancelled());
    const t = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(new Cancelled()); };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type SequenceStatus = "idle" | "running" | "done";

/**
 * Runs the sequence. `getInput` reads the stage's CURRENT state each step (not a
 * stale copy), and `give` is the stage's own marshmallow toss.
 */
export function useFinalSequence(
  getInput: () => SequenceInput,
  give: (id: string) => void,
  /** Final-few layout: the campers to gather in the middle, or null to put everyone back on their own stumps. */
  regroup: (ids: string[] | null) => void,
) {
  const [status, setStatus] = useState<SequenceStatus>("idle");
  const [scene, setScene] = useState<SequenceScene>(IDLE);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const stop = useCallback((message?: string) => {
    controller.current?.abort();
    controller.current = null;
    setScene(IDLE);
    setStatus("idle");
    regroup(null); // back to the normal seating
    if (message) {
      setError(message);
      console.error("[final sequence]", message);
    }
  }, [regroup]);

  // Leaving the tab/page mid-sequence: cancel every pending step.
  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(async () => {
    if (controller.current) return; // already running: ignore double clicks
    const first = getInput();
    const problem = validateSequence(first);
    if (problem) {
      setError(problem);
      console.error("[final sequence]", problem);
      return;
    }
    const run = new AbortController();
    controller.current = run;
    setError(null);
    setStatus("running");

    const atRisk = new Set(first.atRisk);
    // Randomize ONLY the order of the safe campers. The at-risk ones are never in this list.
    const reveals = shuffled(first.participants.filter((id) => !first.safe.has(id) && !atRisk.has(id)));

    try {
      // 3, 2, 1
      for (const n of [3, 2, 1]) {
        setScene({ ...IDLE, countdown: n });
        await wait(COUNTDOWN_STEP_MS, run.signal);
      }
      setScene(IDLE);

      let regroupedAt: number | null = null;
      for (const id of reveals) {
        // Re-check against live state before every reveal.
        const now = getInput();
        const unsafe = now.participants.filter((p) => !now.safe.has(p));
        if (now.atRisk.length !== atRisk.size || now.atRisk.some((p) => !atRisk.has(p))) throw new Error("The at-risk players changed during the animation. Stopped.");
        if (now.atRisk.some((p) => now.safe.has(p))) throw new Error("An at-risk player was given a marshmallow during the animation. Stopped.");
        if (!now.participants.includes(id)) throw new Error(`${now.nameOf(id)} left the ceremony during the animation. Stopped.`);
        if (now.safe.has(id)) continue; // already safe somehow: never reveal twice

        // Down to the final few (6, then 3): everyone else fades and they gather in the middle.
        const step = REGROUP_AT.filter((n) => unsafe.length <= n).pop();
        if (step !== undefined && step !== regroupedAt) {
          regroupedAt = step;
          regroup(unsafe);
          await wait(REGROUP_MS, run.signal);
        }

        const t = timingFor(unsafe.length);
        await wait(t.stageHold, run.signal);

        // Dim, then the arm brings the hidden tag up from below into the middle.
        setScene({ ...IDLE, dim: true, rig: "below", camperId: id, flipMs: t.flipMs });
        await wait(DIM_FADE_MS, run.signal);
        setScene((s) => ({ ...s, rig: "hold" }));
        await wait(RIG_MOVE_MS + 150, run.signal);

        // The arm lets go and sinks back out of frame; the tag stays put.
        setScene((s) => ({ ...s, rig: "release" }));
        await wait(RIG_MOVE_MS + t.hiddenHold, run.signal);

        // The tag flips on its own: squash to nothing, swap to the name side, open back up.
        setScene((s) => ({ ...s, flipClosed: true }));
        await wait(t.flipMs / 2, run.signal);
        setScene((s) => ({ ...s, side: "front", flipClosed: false }));
        await wait(t.flipMs / 2 + t.nameHold, run.signal);

        // The tag drops back out of frame.
        setScene((s) => ({ ...s, rig: "exit" }));
        await wait(RIG_MOVE_MS, run.signal);

        // Marshmallow: the stage's own toss. Their seat sits above the dim while it lands.
        setScene((s) => ({ ...s, spotlightId: id }));
        give(id);
        await wait(TOSS_MS + 100, run.signal);

        // Lights back up, hold the new scene.
        setScene((s) => ({ ...s, dim: false, rig: null }));
        await wait(DIM_FADE_MS, run.signal);
        setScene(IDLE);
        await wait(t.safeHold, run.signal);
      }
      controller.current = null;
      setScene(IDLE);
      setStatus("done"); // only the at-risk campers are left unsafe
    } catch (e) {
      if (e instanceof Cancelled) return; // stop() already cleaned up
      stop(e instanceof Error ? e.message : "The animation stopped unexpectedly.");
    }
  }, [getInput, give, regroup, stop]);

  const cancel = useCallback(() => stop(), [stop]);
  const clear = useCallback(() => { stop(); setError(null); }, [stop]);

  return { status, scene, error, start, cancel, clear, setError };
}
