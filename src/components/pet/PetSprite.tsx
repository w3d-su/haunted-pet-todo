"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { PetState } from "@/lib/game/pet";

function spriteFor(pet: PetState): { src: string; size: string; alt: string } {
  if (pet.stage === "egg") {
    return { src: "/sprites/egg_idle.png", size: "h-16 w-16", alt: "Ghost pet egg" };
  }
  if (pet.stage === "hatchling") {
    return {
      src: "/sprites/hatchling_idle.png",
      size: "h-16 w-16",
      alt: "Ghost pet — hatchling stage",
    };
  }
  const hungry = pet.stage === "adult" && pet.hunger < 30;
  const file =
    pet.stage === "adult"
      ? hungry
        ? "adult_hungry.png"
        : "adult_idle.png"
      : `${pet.stage}_idle.png`;
  const label = pet.stage.replaceAll("_", " ");
  return {
    src: `/sprites/${file}`,
    size: "h-24 w-24",
    alt: hungry ? `Ghost pet — ${label} stage, hungry` : `Ghost pet — ${label} stage`,
  };
}

export function PetSprite({ pet, evolving = false }: { pet: PetState; evolving?: boolean }) {
  const reduced = useReducedMotion() === true;
  const sprite = spriteFor(pet);
  const previousHp = useRef(pet.hp);
  const [hurt, setHurt] = useState(false);

  useEffect(() => {
    if (pet.hp < previousHp.current && pet.status === "alive") {
      setHurt(true);
      const timer = window.setTimeout(() => setHurt(false), reduced ? 0 : 180);
      previousHp.current = pet.hp;
      return () => window.clearTimeout(timer);
    }
    previousHp.current = pet.hp;
  }, [pet.hp, pet.status, reduced]);

  return (
    <div className={`relative inline-block ${evolving ? "pet-evolving" : ""}`}>
      <motion.img
        className={`pixel-art ${sprite.size}`}
        src={sprite.src}
        alt={sprite.alt}
        animate={reduced ? undefined : { y: [0, -4, 0] }}
        transition={
          reduced
            ? { duration: 0 }
            : { duration: 0.6, repeat: Infinity, ease: "linear", times: [0, 0.5, 1] }
        }
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-blood"
        animate={{ opacity: hurt && !reduced ? [0, 0.85, 0, 0.85, 0] : 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.16, ease: "linear" }}
      />
    </div>
  );
}
