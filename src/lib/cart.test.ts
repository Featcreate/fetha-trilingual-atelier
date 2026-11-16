import { describe, expect, it } from "vitest";
import { addCartProduct, normalizeCart, type CartLine } from "./cart";

const storeA = "323e4567-e89b-42d3-a456-426614174000";
const storeB = "423e4567-e89b-42d3-a456-426614174000";
const productA = "123e4567-e89b-42d3-a456-426614174000";
const productB = "223e4567-e89b-42d3-a456-426614174000";

function productId(index: number) {
  return `523e4567-e89b-42d3-a456-${index.toString().padStart(12, "0")}`;
}

describe("per-store digital product carts", () => {
  it("migrates legacy carts and keeps one entry per distinct product", () => {
    expect(
      normalizeCart([
        { productId: productA, quantity: 99 },
        { productId: productA, quantity: 2 },
        { productId: productB, quantity: 8 },
      ]),
    ).toEqual([
      { productId: productA, storeId: "" },
      { productId: productB, storeId: "" },
    ]);
  });

  it("ignores invalid records and invalid product or store identifiers", () => {
    expect(
      normalizeCart([
        null,
        {},
        { productId: "not-a-uuid", storeId: storeA },
        { productId: productA, storeId: "not-a-uuid" },
      ]),
    ).toEqual([{ productId: productA, storeId: "" }]);
    expect(normalizeCart({ productId: productA })).toEqual([]);
  });

  it("allows up to 50 distinct products per store", () => {
    let cart: CartLine[] = [];
    for (let index = 0; index < 50; index += 1) {
      cart = addCartProduct(cart, storeA, productId(index));
    }
    expect(cart).toHaveLength(50);
    expect(addCartProduct(cart, storeA, productId(50))).toBe(cart);
  });

  it("keeps carts for different stores independent", () => {
    let cart: CartLine[] = [];
    for (let index = 0; index < 50; index += 1) {
      cart = addCartProduct(cart, storeA, productId(index));
      cart = addCartProduct(cart, storeB, productId(index + 100));
    }
    expect(cart.filter((line) => line.storeId === storeA)).toHaveLength(50);
    expect(cart.filter((line) => line.storeId === storeB)).toHaveLength(50);
    expect(cart).toHaveLength(100);
  });

  it("does not add the same product twice", () => {
    const current: CartLine[] = [{ productId: productA, storeId: storeA }];
    expect(addCartProduct(current, storeA, productA)).toBe(current);
    expect(addCartProduct(current, storeB, productB)).toEqual([
      { productId: productA, storeId: storeA },
      { productId: productB, storeId: storeB },
    ]);
  });

  it("remains unchanged for invalid store or product identifiers", () => {
    const current: CartLine[] = [];
    expect(addCartProduct(current, "invalid", productA)).toBe(current);
    expect(addCartProduct(current, storeA, "invalid")).toBe(current);
  });
});
