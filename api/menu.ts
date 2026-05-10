import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Menu, MenuItem, ModifierGroup } from "../src/types";
import { cloverRest, isMockMode } from "./_clover";
import { MOCK_MENU } from "./_mockMenu";

/**
 * GET /api/menu
 *
 * Pulls items, modifier groups, modifiers, and categories from Clover
 * Inventory and normalizes them into the simpler shape the UI expects.
 *
 * Clover returns prices in CENTS (long); we convert to dollars (number)
 * once on the server so the React side never has to.
 */

interface CIItem {
  id: string;
  name: string;
  price: number; // cents
  hidden?: boolean;
  available?: boolean;
  priceType?: string;
  modifierGroups?: { elements?: { id: string }[] };
  categories?: { elements?: { id: string; name?: string }[] };
}
interface CIModifier {
  id: string;
  name: string;
  price?: number; // cents
}
interface CIModifierGroup {
  id: string;
  name: string;
  minRequired?: number;
  maxAllowed?: number;
  modifiers?: { elements?: CIModifier[] };
}

const cents = (c?: number) => Math.round(c ?? 0) / 100;

export default async function handler(
  _req: VercelRequest,
  res: VercelResponse,
) {
  // Aggressive cache header — menu rarely changes intra-day, the user
  // can always force-refresh. Stale-while-revalidate keeps the page snappy.
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=300",
  );

  // if (isMockMode()) {
  //   return res.status(200).json(MOCK_MENU);
  // }

  try {
    // 1. Items with their attached modifier groups & categories
    const itemsResp = await cloverRest<{ elements: CIItem[] }>(
      "/items?expand=modifierGroups,categories&limit=200",
    );

    // 2. All modifier groups with their modifiers (one round trip)
    const groupsResp = await cloverRest<{ elements: CIModifierGroup[] }>(
      "/modifier_groups?expand=modifiers&limit=200",
    );

    const groupById = new Map<string, CIModifierGroup>();
    for (const g of groupsResp.elements) groupById.set(g.id, g);

    const categories = new Set<string>();

    const items: MenuItem[] = itemsResp.elements
      .filter((i) => !i.hidden)
      .map((i) => {
        const cat = i.categories?.elements?.[0]?.name?.trim() || "Menu";
        categories.add(cat);

        // Modifier groups whose name starts with "Sub " are in-store-only
        // substitution helpers (e.g. "Sub Mix-in" lets a cashier swap a
        // Signature Roll's mix-in on the POS without canceling the order).
        // We hide them from the customer-facing menu — the website should
        // present signature rolls as one-tap fixed items.
        const isInStoreOnly = (name: string) =>
          name.toLowerCase().startsWith("sub ");

        const modGroups: ModifierGroup[] =
          i.modifierGroups?.elements
            ?.map((ref) => {
              const g = groupById.get(ref.id);
              if (!g) {
                return {
                  id: ref.id,
                  name: "Options",
                  minSelections: 0,
                  maxSelections: 1,
                  modifiers: [],
                };
              }
              return {
                id: g.id,
                name: g.name,
                minSelections: g.minRequired ?? 0,
                maxSelections: g.maxAllowed ?? 1,
                modifiers: (g.modifiers?.elements ?? []).map((m) => ({
                  id: m.id,
                  name: m.name,
                  priceDelta: cents(m.price),
                  group: g.name,
                })),
              };
            })
            .filter((g) => !isInStoreOnly(g.name)) ?? [];

        return {
          id: i.id,
          name: i.name,
          price: cents(i.price),
          category: cat,
          available: i.available !== false,
          modifierGroups: modGroups,
        };
      });

    const menu: Menu = {
      categories: Array.from(categories),
      items,
    };
    return res.status(200).json(menu);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
