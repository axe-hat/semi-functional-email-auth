import { readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "../src/app.js";
import { config } from "./helpers.js";

const spec = JSON.parse(readFileSync(join(__dirname, "..", "openapi.json"), "utf8")) as {
  paths: Record<string, Record<string, unknown>>;
};

describe("openapi.json", () => {
  const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
    Object.keys(methods).map((method) => [method.toUpperCase(), path] as const),
  );

  it.each(operations)("%s %s is a real route", async (method, path) => {
    const app = createApp({ config });
    const url = path.replace("{id}", "some-id");
    const res = await request(app)[method.toLowerCase() as "get"](url);
    expect(res.body.message).not.toBe("Not found.");
  });
});
