import { describe, expect, it } from "vitest";
import { addCartProduct, normalizeCart, type CartLine } from "./cart";

const productA = "123e4567-e89b-42d3-a456-426614174000";
const productB = "223e4567-e89b-42d3-a456-426614174000";

describe("digital product cart", () => {
  it("migrates legacy quantity carts to one entry per distinct product", () => {
    expect(
      normalizeCart([
        { productId: productA, quantity: 99 },
        { productId: productA, quantity: 2 },
        { productId: productB, quantity: 8 },
      ]),
    ).toEqual([{ productId: productA }, { productId: productB }]);
  });

  it("ignores invalid records and invalid product identifiers", () => {
    expect(
      normalizeCart([
        null,
        {},
        { productId: "not-a-uuid" },
        { productId: productA },
      ]),
    ).toEqual([{ productId: productA }]);
    expect(normalizeCart({ productId: productA })).toEqual([]);
  });

  it("keeps no more than 50 distinct products", () => {
    const products = Array.from({ length: 55 }, (_, index) => ({
      productId: `123e4567-e89b-42d3-a456-${index.toString().padStart(12, "0")}`,
    }));
    expect(normalizeCart(products)).toHaveLength(50);
  });

  it("does not increase the cart when the same product is added twice", () => {
    const current: CartLine[] = [{ productId: productA }];
    expect(addCartProduct(current, productA)).toBe(current);
    expect(addCartProduct(current, productB)).toEqual([
      { productId: productA },
      { productId: productB },
    ]);
  });

  it("does not exceed the 50-product cart limit", () => {
    const current = Array.from({ length: 50 }, (_, index) => ({
      productId: `123e4567-e89b-42d3-a456-${index.toString().padStart(12, "0")}`,
    }));
    expect(addCartProduct(current, productB)).toBe(current);
  });
});
