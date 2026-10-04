import { createService } from "./service.js";
import { createDelivery } from "./delivery.js";
import { createAttachments } from "./attachments.js";
import { createStaff } from "./staff.js";
import { retainCommunications } from "./retention.js";
import { createManagement } from "./management.js";
import { CommunicationError, flag, fail, UUID, verifySecret } from "./policy.js";

export default {
  id: "isvoi-communications",
  handler(router: any, context: any) {
    const service = createService(context),
      delivery = createDelivery(context, service),
      attachments = createAttachments(context, service),
      staff = createStaff(context, service),
      management = createManagement(context),
      db = context.database;
    let retentionCheckAfter = 0;
    const handler = (fn: any) => async (req: any, res: any) => {
      try {
        if (!flag(context.env.ISVOI_COMMUNICATIONS_ENABLED)) fail("COMMUNICATIONS_DISABLED", 503);
        await fn(req, res);
      } catch (e: any) {
        if (!(e instanceof CommunicationError))
          context.logger?.error(e, "Unexpected communications endpoint failure");
        res.status(e instanceof CommunicationError ? e.status : 500).json({
          errors: [
            {
              message: e instanceof CommunicationError ? e.code : "COMMUNICATIONS_OPERATION_FAILED",
            },
          ],
        });
      }
    };
    router.get(
      "/v1/inbox",
      handler(async (req: any, res: any) =>
        res.json({
          data: await service.inbox(await service.actor(req.accountability?.user), req.query),
        }),
      ),
    );
    router.get(
      "/v1/threads/:id/messages",
      handler(async (req: any, res: any) =>
        res.json({
          data: await service.messages(
            await service.actor(req.accountability?.user),
            req.params.id,
            req.query,
          ),
        }),
      ),
    );
    router.post(
      "/v1/commands",
      handler(async (req: any, res: any) =>
        res.json({
          data: await service.commands(await service.actor(req.accountability?.user), req.body),
        }),
      ),
    );
    router.get(
      "/v1/audience",
      handler(async (req: any, res: any) =>
        res.json({ data: await service.audience(await service.actor(req.accountability?.user)) }),
      ),
    );
    router.get(
      "/v1/audience/contacts",
      handler(async (req: any, res: any) =>
        res.json({
          data: await service.audienceContacts(
            await service.actor(req.accountability?.user),
            req.query,
          ),
        }),
      ),
    );
    router.get(
      "/v1/audience/contacts/:id",
      handler(async (req: any, res: any) =>
        res.json({
          data: await service.audienceContact(
            await service.actor(req.accountability?.user),
            req.params.id,
          ),
        }),
      ),
    );
    router.get(
      "/v1/connections",
      handler(async (req: any, res: any) =>
        res.json({ data: await service.connections(await service.actor(req.accountability?.user)) }),
      ),
    );
    router.get("/v1/conversations/:id/link-options", handler(async (req: any, res: any) =>
      res.json({ data: await service.linkOptions(await service.actor(req.accountability?.user), req.params.id) }),
    ));
    router.post("/v1/audience/contacts/:id/actions", handler(async (req: any, res: any) =>
      res.json({ data: await service.contactAction(await service.actor(req.accountability?.user), req.params.id, req.body) }),
    ));
    router.get(
      "/v1/management",
      handler(async (req: any, res: any) =>
        res.json({ data: await management.overview(await service.actor(req.accountability?.user)) }),
      ),
    );
    router.post(
      "/v1/management/connections/:id",
      handler(async (req: any, res: any) =>
        res.json({
          data: await management.updateConnection(
            await service.actor(req.accountability?.user),
            req.params.id,
            req.body,
          ),
        }),
      ),
    );
    router.get(
      "/v1/campaigns",
      handler(async (req: any, res: any) =>
        res.json({ data: await management.listCampaigns(await service.actor(req.accountability?.user)) }),
      ),
    );
    router.post(
      "/v1/campaigns",
      handler(async (req: any, res: any) =>
        res.status(201).json({
          data: await management.saveCampaign(await service.actor(req.accountability?.user), req.body),
        }),
      ),
    );
    router.post(
      "/v1/campaigns/:id/actions",
      handler(async (req: any, res: any) =>
        res.json({
          data: await management.action(
            await service.actor(req.accountability?.user),
            req.params.id,
            req.body,
          ),
        }),
      ),
    );
    router.get(
      "/v1/staff",
      handler(async (req: any, res: any) => {
        const a = await service.actor(req.accountability?.user);
        const stores = await db("comm_staff")
          .where({ user_id: a.user, enabled: true })
          .pluck("store_id");
        res.json({
          data: await db("comm_staff as s")
            .join("directus_users as u", "u.id", "s.user_id")
            .whereIn("s.store_id", stores)
            .where({ "s.enabled": true, "u.status": "active" })
            .select("s.user_id", "s.store_id", "u.first_name", "u.last_name"),
        });
      }),
    );
    router.post(
      "/v1/attachments",
      handler(async (req: any, res: any) => {
        if (req.headers["content-type"] !== "application/octet-stream")
          return fail("BINARY_UPLOAD_REQUIRED", 415);
        res.status(201).json({
          data: await attachments.upload(
            await service.actor(req.accountability?.user),
            String(req.query.conversation_id || ""),
            req,
            { name: req.query.name, mime: req.query.mime, size: req.headers["content-length"] },
          ),
        });
      }),
    );
    router.get(
      "/v1/attachments/:id/status",
      handler(async (req: any, res: any) => {
        if (!UUID.test(req.params.id)) return fail("NOT_FOUND", 404);
        const f = await db("comm_attachments").where({ id: req.params.id }).first();
        if (!f) return fail("NOT_FOUND", 404);
        await service.permitted(
          db,
          await service.actor(req.accountability?.user),
          f.conversation_id,
        );
        res.json({ data: { id: f.id, name: f.name, state: f.state, error_code: f.error_code } });
      }),
    );
    router.get(
      "/v1/attachments/:id",
      handler(async (req: any, res: any) => {
        const file = await attachments.get(
          await service.actor(req.accountability?.user),
          req.params.id,
        );
        res.set({
          "Content-Type": file.mime,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Accept-Ranges": "bytes",
          "Content-Disposition": `${file.kind === "document" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        });
        let start = 0,
          end = Number(file.size) - 1;
        if (req.headers.range) {
          const m = String(req.headers.range).match(/^bytes=(\d+)-(\d*)$/);
          if (!m) return res.status(416).end();
          start = Number(m[1]);
          end = m[2] ? Math.min(Number(m[2]), end) : end;
          if (start > end) return res.status(416).end();
          res.status(206).set("Content-Range", `bytes ${start}-${end}/${file.size}`);
        }
        res.set("Content-Length", String(end - start + 1));
        const stream = await attachments.stream(file, start, end);
        stream.on("error", () => res.destroy());
        stream.pipe(res);
      }),
    );
    router.post(
      "/v1/webhooks/:connectionId",
      handler(async (req: any, res: any) => {
        if (!UUID.test(req.params.connectionId)) return fail("NOT_FOUND", 404);
        const n = await db("comm_connections")
          .where({ id: req.params.connectionId, enabled: true })
          .first();
        if (!n || !["max", "vk"].includes(n.platform)) return fail("NOT_FOUND", 404);
        if (!/^[A-Z][A-Z0-9_]{2,100}$/.test(n.secret_ref))
          return fail("CONNECTION_NOT_CONFIGURED", 503);
        const expected = context.env[`${n.secret_ref}_WEBHOOK_SECRET`];
        if (
          !verifySecret(
            n.platform === "max" ? req.headers["x-max-bot-api-secret"] : req.body?.secret,
            expected,
          )
        )
          return fail("FORBIDDEN", 403);
        if (n.platform === "vk" && String(req.body?.group_id) !== n.external_id)
          return fail("FORBIDDEN", 403);
        if (n.platform === "vk" && req.body?.type === "confirmation")
          return res
            .type("text/plain")
            .send(String(context.env[`${n.secret_ref}_CONFIRMATION`] || ""));
        await service.ingest(n.id, req.body);
        res.type("text/plain").send(n.platform === "vk" ? "ok" : "ok");
      }),
    );
    router.post(
      "/v1/workers/:id/next",
      handler(async (req: any, res: any) =>
        res.json({ data: await delivery.next(req.params.id, req.accountability?.user) }),
      ),
    );
    router.post(
      "/v1/workers/:id/complete",
      handler(async (req: any, res: any) =>
        res.json({
          data: await delivery.complete(req.params.id, req.accountability?.user, req.body),
        }),
      ),
    );
    router.post(
      "/v1/workers/:id/process",
      handler(async (req: any, res: any) => {
        await db.transaction((trx: any) =>
          delivery.worker(trx, req.params.id, req.accountability?.user),
        );
        const incoming = await service.processIncoming(req.params.id);
        if (incoming) return res.json({ data: incoming });
        const connection = await db("comm_connections")
          .where({ id: req.params.id, enabled: true })
          .first();
        if (!connection) return fail("CONNECTION_DISABLED", 403);
        const swept = await db.transaction((trx: any) => staff.sweep(trx, connection));
        if (swept) return res.json({ data: swept });
        if (Date.now() >= retentionCheckAfter) {
          retentionCheckAfter = Date.now() + 60000;
          const retained = await retainCommunications(db, attachments.remove);
          if (!("not_due" in retained))
            return res.json({ data: { result: "retention", ...retained } });
        }
        res.json({ data: null });
      }),
    );
    router.post(
      "/v1/workers/:id/scan",
      handler(async (req: any, res: any) => {
        await db.transaction((trx: any) =>
          delivery.worker(trx, req.params.id, req.accountability?.user),
        );
        res.json({ data: await attachments.scanOne(req.params.id) });
      }),
    );
    router.get(
      "/v1/workers/:id/media",
      handler(async (req: any, res: any) => {
        await db.transaction((trx: any) =>
          delivery.worker(trx, req.params.id, req.accountability?.user),
        );
        const f = await db("comm_attachments")
          .where({ connection_id: req.params.id, state: "pending" })
          .orderBy("created_at")
          .first();
        res.json({
          data: f
            ? { id: f.id, external_ref: f.external_ref, kind: f.kind, name: f.name, mime: f.mime }
            : null,
        });
      }),
    );
    router.post(
      "/v1/workers/:id/media/:fileId",
      handler(async (req: any, res: any) => {
        await db.transaction((trx: any) =>
          delivery.worker(trx, req.params.id, req.accountability?.user),
        );
        if (!UUID.test(req.params.fileId)) return fail("NOT_FOUND", 404);
        const f = await db("comm_attachments")
          .where({ id: req.params.fileId, connection_id: req.params.id, state: "pending" })
          .first();
        if (!f) return fail("NOT_FOUND", 404);
        if (req.body?.error_code) {
          const code = String(req.body.error_code);
          if (
            ![
              "FILE_TOO_LARGE",
              "FILE_FORMAT_NOT_ALLOWED",
              "MEDIA_URL_FORBIDDEN",
              "MEDIA_ADDRESS_FORBIDDEN",
              "MEDIA_UNAVAILABLE",
            ].includes(code)
          )
            return fail("INVALID_MEDIA_ERROR");
          await db("comm_attachments")
            .where({ id: f.id })
            .update({ state: "rejected", error_code: code });
          return res.json({ data: { id: f.id, state: "rejected" } });
        }
        const { readBounded } = await import("./attachments.js");
        const bytes = await readBounded(req, req.headers["content-length"]);
        res.json({
          data: await attachments.store(bytes, {
            id: f.id,
            name: f.name,
            mime: f.mime,
            kind: f.kind,
          }),
        });
      }),
    );
    router.get(
      "/v1/workers/:id/media/:fileId",
      handler(async (req: any, res: any) => {
        await db.transaction((trx: any) =>
          delivery.worker(trx, req.params.id, req.accountability?.user),
        );
        const op = await db("comm_operations as o")
          .join("comm_outbox as b", "b.id", "o.outbox_id")
          .where({
            "o.attempt_id": req.query.attempt_id,
            "o.worker_id": req.accountability.user,
            "o.state": "in_flight",
            "b.connection_id": req.params.id,
          })
          .select("o.payload")
          .first();
        if (!op || op.payload.attachment_id !== req.params.fileId) return fail("FORBIDDEN", 403);
        const f = await db("comm_attachments")
          .where({ id: req.params.fileId, state: "ready" })
          .first();
        if (!f) return fail("FILE_NOT_READY", 409);
        res.set({
          "Content-Type": f.mime,
          "Content-Length": String(f.size),
          "Cache-Control": "no-store",
          "X-Media-Kind": f.kind,
          "X-Media-Name": encodeURIComponent(f.name),
        });
        const stream = await attachments.stream(f);
        stream.on("error", () => res.destroy());
        stream.pipe(res);
      }),
    );
    router.post(
      "/v1/workers/:id/ingest",
      handler(async (req: any, res: any) => {
        await db.transaction(async (trx: any) => {
          const n = await delivery.worker(trx, req.params.id, req.accountability?.user);
          if (n.platform !== "telegram") fail("FORBIDDEN", 403);
        });
        res.json({ data: await service.ingest(req.params.id, req.body.update) });
      }),
    );
    router.post(
      "/v1/workers/:id/poll",
      handler(async (req: any, res: any) => {
        if (!UUID.test(req.body?.instance_id || "")) return fail("INSTANCE_REQUIRED");
        const data = await db.transaction(async (trx: any) => {
          const n = await delivery.worker(trx, req.params.id, req.accountability?.user);
          if (n.platform !== "telegram") return fail("FORBIDDEN", 403);
          if (
            n.poll_owner &&
            n.poll_owner !== req.body.instance_id &&
            new Date(n.poll_until) > new Date()
          )
            return fail("POLLER_ALREADY_ACTIVE", 409);
          await trx("comm_connections")
            .where({ id: n.id })
            .update({ poll_owner: req.body.instance_id, poll_until: new Date(Date.now() + 90000) });
          return { offset: Number(n.poll_offset) };
        });
        res.json({ data });
      }),
    );
    router.post(
      "/v1/workers/:id/poll-result",
      handler(async (req: any, res: any) => {
        const n = await db.transaction((trx: any) =>
          delivery.worker(trx, req.params.id, req.accountability?.user),
        );
        if (
          n.platform !== "telegram" ||
          n.poll_owner !== req.body.instance_id ||
          new Date(n.poll_until) <= new Date()
        )
          return fail("POLL_LEASE_EXPIRED", 409);
        const update = req.body.update;
        if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0)
          return fail("INVALID_UPDATE");
        await service.ingest(n.id, update);
        const changed = await db("comm_connections")
          .where({ id: n.id, poll_owner: req.body.instance_id })
          .where("poll_until", ">", db.fn.now())
          .update({ poll_offset: db.raw("GREATEST(poll_offset,?)", [update.update_id + 1]) });
        if (!changed) return fail("POLL_LEASE_EXPIRED", 409);
        res.json({ data: { accepted: true } });
      }),
    );
  },
};
