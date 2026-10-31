import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

describe("Tally API", () => {
  it("reports a healthy service", async () => {
    const response = await request(createApp()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
  it("rejects invalid subscription transitions", async () => {
    const response = await request(createApp()).post("/api/subscriptions/sub_1/transition").send({ status: "DRAFT" });
    expect(response.status).toBe(409);
  });
});
