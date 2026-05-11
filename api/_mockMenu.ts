import type { Menu, Modifier } from "../src/types";

/**
 * Mock Yolo Rollo menu — used when USE_MOCK_CLOVER=true or when the
 * Clover env vars aren't set. Mirrors the same shape /api/menu emits
 * from live Clover after the reorganization script runs, so the UI
 * looks identical in both modes.
 *
 * Source of truth is your in-store menu board. Update both this file and
 * Clover when the menu changes.
 */

// ─── Modifier option pools (referenced from multiple items) ─────────────

const BASE_OPTIONS: Modifier[] = [
  { id: "base-vanilla",    name: "Vanilla",    priceDelta: 0, group: "Base" },
  { id: "base-strawberry", name: "Strawberry", priceDelta: 0, group: "Base" },
  { id: "base-mango",      name: "Mango",      priceDelta: 0, group: "Base" },
  { id: "base-chocolate",  name: "Chocolate",  priceDelta: 0, group: "Base" },
  { id: "base-coconut",    name: "Coconut",    priceDelta: 0, group: "Base" },
];

const MIXIN_OPTIONS: Modifier[] = [
  { id: "mix-banana",      name: "Banana",        priceDelta: 0, group: "Mix-in" },
  { id: "mix-oreo",        name: "Oreo Cookie",   priceDelta: 0, group: "Mix-in" },
  { id: "mix-brownie",     name: "Brownie",       priceDelta: 0, group: "Mix-in" },
  { id: "mix-strawberry",  name: "Strawberry",    priceDelta: 0, group: "Mix-in" },
  { id: "mix-pineapple",   name: "Pineapple",     priceDelta: 0, group: "Mix-in" },
  { id: "mix-mango",       name: "Mango",         priceDelta: 0, group: "Mix-in" },
  { id: "mix-blueberry",   name: "Blueberry",     priceDelta: 0, group: "Mix-in" },
  { id: "mix-cheesecake",  name: "Cheesecake",    priceDelta: 0, group: "Mix-in" },
  { id: "mix-peanutbutter",name: "Peanut Butter", priceDelta: 0, group: "Mix-in" },
];

const TOPPING_OPTIONS: Modifier[] = [
  { id: "top-mango",        name: "Mango",            priceDelta: 0, group: "Topping" },
  { id: "top-strawberry",   name: "Strawberry",       priceDelta: 0, group: "Topping" },
  { id: "top-pineapple",    name: "Pineapple",        priceDelta: 0, group: "Topping" },
  { id: "top-condensed",    name: "Condensed Milk",   priceDelta: 0, group: "Topping" },
  { id: "top-chocsyrup",    name: "Chocolate Syrup",  priceDelta: 0, group: "Topping" },
  { id: "top-caramel",      name: "Caramel Syrup",    priceDelta: 0, group: "Topping" },
  { id: "top-mangoboba",    name: "Mango Boba",       priceDelta: 0, group: "Topping" },
  { id: "top-strawboba",    name: "Strawberry Boba",  priceDelta: 0, group: "Topping" },
  { id: "top-oreo",         name: "Oreo Cookie",      priceDelta: 0, group: "Topping" },
  { id: "top-mms",          name: "M&Ms",             priceDelta: 0, group: "Topping" },
  { id: "top-gummy",        name: "Gummy Bears",      priceDelta: 0, group: "Topping" },
];

const BOBA_OPTIONS: Modifier[] = [
  { id: "boba-tapioca",    name: "Tapioca Boba",    priceDelta: 0, group: "Boba" },
  { id: "boba-mango",      name: "Mango Boba",      priceDelta: 0, group: "Boba" },
  { id: "boba-strawberry", name: "Strawberry Boba", priceDelta: 0, group: "Boba" },
  { id: "boba-lychee",     name: "Lychee Boba",     priceDelta: 0, group: "Boba" },
];

// ─── Items ───────────────────────────────────────────────────────────────

// Rolled ice cream items that already have a baked-in recipe (Yolo
// Signatures, Signature Rolls) still let the customer modify mix-ins
// and toppings — same picker as Build Your Own, just without the Base
// step. Use min=0 max=3 so picking nothing falls back to the default
// recipe described on the card.
const ROLLED_MODS = [
  {
    id: "mixin",
    name: "Mix-in",
    minSelections: 0,
    maxSelections: 3,
    modifiers: MIXIN_OPTIONS,
  },
  {
    id: "topping",
    name: "Topping",
    minSelections: 0,
    maxSelections: 3,
    modifiers: TOPPING_OPTIONS,
  },
];

const yoloSignature = (id: string, name: string, description: string) => ({
  id, name, description, price: 8.99,
  category: "Rolled Ice Cream",
  available: true,
  modifierGroups: ROLLED_MODS,
});

const signatureRoll = (
  num: number,
  flavor: string,
  description: string,
) => ({
  id: `sig-roll-${num}`,
  name: `Signature Roll #${num} — ${flavor}`,
  description,
  price: 6.99,
  category: "Rolled Ice Cream",
  available: true,
  modifierGroups: ROLLED_MODS,
});

const bubbleTea = (id: string, flavor: string) => ({
  id: `bt-${id}`,
  name: `${flavor} Bubble Tea`,
  price: 5.99,
  category: "Bubble Tea",
  available: true,
  modifierGroups: [
    {
      id: "boba",
      name: "Boba",
      minSelections: 0,
      maxSelections: 1,
      modifiers: BOBA_OPTIONS,
    },
  ],
});

const smoothie = (id: string, flavor: string) => ({
  id: `sm-${id}`,
  name: `${flavor} Smoothie`,
  price: 5.99,
  category: "Smoothie",
  available: true,
  modifierGroups: [],
});

const drink = (id: string, name: string, price: number) => ({
  id: `dr-${id}`,
  name,
  price,
  category: "Cold Drinks",
  available: true,
  modifierGroups: [],
});

// ─── Menu ────────────────────────────────────────────────────────────────

export const MOCK_MENU: Menu = {
  categories: ["Rolled Ice Cream", "Bubble Tea", "Smoothie", "Cold Drinks"],
  items: [
    // —— Yolo Signatures ($8.99, fixed)
    yoloSignature(
      "yolo-waffle",
      "Yolo Signature — Waffle Bowl Classic",
      "Our crispy waffle bowl, layered ice cream rolls, and chocolate drizzle.",
    ),
    yoloSignature(
      "yolo-strawberry-crumble",
      "Yolo Signature — Strawberry Crumble",
      "Fresh strawberry rolled ice cream with graham crumble and condensed milk.",
    ),

    // —— Signature Rolls #1–#6 ($6.99, fixed, 1 mix-in + 1 topping included)
    signatureRoll(1, "Cookies & Cream",        "Vanilla base · Oreo mix-in · Oreo topping"),
    signatureRoll(2, "Strawberry Cheesecake",  "Strawberry base · Cheesecake mix-in · Strawberry topping"),
    signatureRoll(3, "Choco Oreo",             "Chocolate base · Oreo mix-in · Chocolate syrup"),
    signatureRoll(4, "Mango Strawberry",       "Mango base · Strawberry mix-in · Mango topping"),
    signatureRoll(5, "Coconut M&M",            "Coconut base · Strawberry mix-in · M&Ms topping"),
    signatureRoll(6, "Vanilla Cheesecake",     "Vanilla base · Cheesecake mix-in · Condensed milk"),

    // —— Customize Your Own Roll — the only ice cream item with pickers
    {
      id: "customize-your-own",
      name: "Customize Your Own Roll",
      description: "Pick a base, up to 3 mix-ins, and up to 3 toppings. Your roll, your way.",
      price: 6.99,
      category: "Rolled Ice Cream",
      available: true,
      modifierGroups: [
        {
          id: "base",
          name: "Choose your base",
          minSelections: 1,
          maxSelections: 1,
          modifiers: BASE_OPTIONS,
        },
        {
          id: "mixin",
          name: "Choose your mix-in",
          minSelections: 0,
          maxSelections: 3,
          modifiers: MIXIN_OPTIONS,
        },
        {
          id: "topping",
          name: "Choose your topping",
          minSelections: 0,
          maxSelections: 3,
          modifiers: TOPPING_OPTIONS,
        },
      ],
    },

    // —— Bubble Tea (10 flavors)
    bubbleTea("strawberry", "Strawberry"),
    bubbleTea("mango",      "Mango"),
    bubbleTea("coconut",    "Coconut"),
    bubbleTea("honeydew",   "Honeydew"),
    bubbleTea("taro",       "Taro"),
    bubbleTea("milktea",    "Milk Tea"),
    bubbleTea("jasmine",    "Jasmine"),
    bubbleTea("blueberry",  "Blueberry"),
    bubbleTea("lychee",     "Lychee"),
    bubbleTea("thai",       "Thai"),

    // —— Smoothies (5 flavors, $5.99 each, no mods)
    smoothie("strawberry", "Strawberry"),
    smoothie("mango",      "Mango"),
    smoothie("coconut",    "Coconut"),
    smoothie("vanilla",    "Vanilla"),
    smoothie("chocolate",  "Chocolate"),

    // —— Cold Drinks
    drink("water",         "Bottle Water",         1.39),
    drink("bottle",        "Bottle Drink",         2.29),
    drink("icedtea",       "Iced Tea",             2.19),
    drink("icechocolate",  "Ice Chocolate",        2.19),
    drink("icethai",       "Ice Thai Tea",         2.19),
    drink("monster",       "Monster Energy",       3.65),
    drink("starbucks",     "Starbucks Frappuccino",3.50),
  ],
};
