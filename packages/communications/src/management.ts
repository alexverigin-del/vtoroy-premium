import { randomUUID } from "node:crypto";
import { canonical, digest, fail, UUID } from "./policy.js";
import type { Actor, Connection, Context, Database } from "./types.js";

const allowedPlatforms = new Set(["telegram", "max", "vk"]);
const terminalStates = ["accepted", "failed", "uncertain", "blocked", "cancelled", "suppressed"];

function text(value: unknown, max: number, required = false) {
  const result = String(value ?? "").trim();
  if ((required && !result) || result.length > max) fail("INVALID_TEXT");
  return result;
}

function exposedSettings(connection: any) {
  return {
    welcome_text: String(connection.settings?.welcome_text || ""),
    welcome_file_id: connection.settings?.welcome_file_id || null,
    consent_text: String(connection.settings?.consent_text || ""),
    consent_version: String(connection.settings?.consent_version || ""),
    subscriptions_enabled: Boolean(connection.settings?.subscriptions_enabled),
    subscriptions_pilot_only: Boolean(connection.settings?.subscriptions_pilot_only),
    config_version: Number(connection.settings?.config_version || 1),
  };
}

export function callToAction(platform: string, label?: string | null, url?: string | null) {
  if (!label || !url) return {};
  if (platform === "telegram")
    return { reply_markup: { inline_keyboard: [[{ text: label, url }]] } };
  if (platform === "max")
    return {
      attachments: [
        { type: "inline_keyboard", payload: { buttons: [[{ type: "link", text: label, url }]] } },
      ],
    };
  return {
    keyboard: JSON.stringify({
      inline: true,
      buttons: [[{ action: { type: "open_link", label, link: url } }]],
    }),
  };
}

export function createManagement(context: Context) {
  const db = context.database;

  function memberships(trx: Database, actor: Actor, publish = false) {
    let query = trx("comm_staff").where({ user_id: actor.user, enabled: true, can_manage: true });
    if (publish) query = query.where({ can_publish: true });
    return query;
  }

  async function connectionAccess(trx: Database, actor: Actor, id: string, publish = false) {
    if (!UUID.test(id)) return fail("NOT_FOUND", 404);
    const connection = await trx("comm_connections").where({ id }).first();
    if (!connection) return fail("NOT_FOUND", 404);
    const allowed = await memberships(trx, actor, publish).where({ store_id: connection.store_id }).first();
    if (!allowed) return fail("FORBIDDEN", 403);
    return connection as Connection;
  }

  async function image(trx: Database, id: unknown) {
    if (id === null || id === undefined || id === "") return null;
    if (typeof id !== "string" || !UUID.test(id)) return fail("INVALID_IMAGE");
    const file = await trx("directus_files").where({ id }).first();
    if (!file || !String(file.type || "").startsWith("image/") || Number(file.filesize || 0) > 5_000_000)
      return fail("INVALID_IMAGE");
    return id;
  }

  async function once(
    trx: Database,
    actor: Actor,
    type: string,
    key: unknown,
    input: unknown,
    operation: () => Promise<any>,
  ) {
    if (typeof key !== "string" || !UUID.test(key)) return fail("COMMAND_KEY_REQUIRED");
    const fingerprint = digest(canonical(input));
    await trx("comm_command_receipts")
      .insert({ actor_id: actor.user, command_type: type, command_key: key, fingerprint })
      .onConflict(["actor_id", "command_type", "command_key"])
      .ignore();
    const receipt = await trx("comm_command_receipts")
      .where({ actor_id: actor.user, command_type: type, command_key: key })
      .forUpdate()
      .first();
    if (receipt.fingerprint !== fingerprint) return fail("IDEMPOTENCY_PARAMETER_MISMATCH", 409);
    if (receipt.result) return receipt.result;
    const result = await operation();
    await trx("comm_command_receipts").where({ id: receipt.id }).update({ result });
    return result;
  }

  function pilotRecipient(connection: any, identity: any) {
    return (
      Boolean(identity.is_test) ||
      (connection.settings?.pilot_user_ids || [])
        .map(String)
        .includes(String(identity.external_user_id))
    );
  }

  async function eligibleRecipients(
    source: Database,
    campaign: any,
    connections: any[],
  ) {
    if (!connections.length) return new Map<string, any>();
    const subscriptions = await source("comm_subscriptions").where({
      topic_key: campaign.topic_key,
      consent: true,
    });
    const identities = subscriptions.length
      ? await source("comm_identities")
          .whereIn(
            "id",
            subscriptions.map((subscription: any) => subscription.identity_id),
          )
          .whereIn(
            "connection_id",
            connections.map((connection: any) => connection.id),
          )
          .whereNot("availability", "blocked")
      : [];
    const recipients = new Map<string, any>();
    for (const identity of identities) {
      const connection = connections.find(
        (candidate: any) => candidate.id === identity.connection_id,
      );
      if (!connection) continue;
      const pilot = pilotRecipient(connection, identity);
      if (campaign.is_test ? !pilot : identity.is_test) continue;
      const previous = recipients.get(identity.contact_id);
      if (!previous || identity.preferred) recipients.set(identity.contact_id, identity);
    }
    return recipients;
  }

  async function overview(actor: Actor) {
    const stores = await memberships(db, actor).pluck("store_id");
    if (!stores.length) return fail("FORBIDDEN", 403);
    const connections = await db("comm_connections")
      .whereIn("store_id", stores)
      .orderBy("platform")
      .select("id", "name", "platform", "enabled", "mode", "marketing_enabled", "settings");
    const identities = await db("comm_identities as identity")
      .join("comm_connections as connection", "connection.id", "identity.connection_id")
      .whereIn("connection.store_id", stores)
      .whereNot("identity.availability", "blocked")
      .select(
        "identity.id",
        "identity.connection_id",
        "identity.external_user_id",
        "identity.is_test",
        "connection.platform",
        "connection.name",
        "connection.settings",
      );
    return {
      connections: connections.map((connection: any) => ({
        id: connection.id,
        name: connection.name,
        platform: connection.platform,
        enabled: connection.enabled,
        mode: connection.mode,
        marketing_enabled: connection.marketing_enabled,
        settings: exposedSettings(connection),
      })),
      topics: await db("comm_topics").orderBy("sort"),
      test_recipients: identities
        .filter((identity: any) =>
          pilotRecipient({ settings: identity.settings }, identity),
        )
        .map((identity: any) => ({
          id: identity.id,
          connection_id: identity.connection_id,
          platform: identity.platform,
          label: `${identity.name} · ${String(identity.external_user_id).replace(/.(?=.{4})/g, "•")}`,
        })),
    };
  }

  async function updateConnection(actor: Actor, id: string, input: any) {
    return db.transaction(async (trx: Database) =>
      once(trx, actor, "connection_settings", input?.key, { id, ...input }, async () => {
        const connection = await connectionAccess(trx, actor, id);
        const current = exposedSettings(connection);
        if (Number(input.expected_version) !== current.config_version)
          return fail("STALE_CONFIGURATION", 409);
        const settings = {
          ...connection.settings,
          welcome_text: text(input.welcome_text, 2000, true),
          welcome_file_id: await image(trx, input.welcome_file_id),
          consent_text: text(input.consent_text, 4000),
          consent_version: text(input.consent_version, 100),
          subscriptions_enabled: input.subscriptions_enabled === true,
          subscriptions_pilot_only: input.subscriptions_pilot_only === true,
          config_version: current.config_version + 1,
        };
        if (settings.subscriptions_enabled && (!settings.consent_text || !settings.consent_version))
          return fail("CONSENT_CONFIGURATION_REQUIRED");
        let marketingEnabled = connection.marketing_enabled;
        if (input.marketing_enabled !== undefined && Boolean(input.marketing_enabled) !== marketingEnabled) {
          await connectionAccess(trx, actor, id, true);
          if (input.confirm_marketing !== true) return fail("MARKETING_CONFIRMATION_REQUIRED");
          marketingEnabled = Boolean(input.marketing_enabled);
        }
        await trx("comm_connections")
          .where({ id })
          .update({ settings, marketing_enabled: marketingEnabled });
        return {
          ok: true,
          id,
          marketing_enabled: marketingEnabled,
          settings: exposedSettings({ settings }),
        };
      }),
    );
  }

  function variant(input: any) {
    if (!allowedPlatforms.has(input?.platform)) return fail("INVALID_PLATFORM");
    const body = text(input.text, 3500, true);
    const label = text(input.cta_label, 80);
    const url = text(input.cta_url, 1000);
    if (Boolean(label) !== Boolean(url)) return fail("INVALID_CTA");
    if (url) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return fail("INVALID_CTA");
      }
      if (
        parsed.protocol !== "https:" ||
        !(parsed.hostname === "isvoi.ru" || parsed.hostname.endsWith(".isvoi.ru"))
      )
        return fail("INVALID_CTA");
    }
    return { platform: input.platform, text: body, cta_label: label || null, cta_url: url || null };
  }

  async function listCampaigns(actor: Actor) {
    const stores = await memberships(db, actor).pluck("store_id");
    if (!stores.length) return fail("FORBIDDEN", 403);
    const campaigns = await db("comm_campaigns as campaign")
      .leftJoin("comm_content as content", "content.id", "campaign.content_id")
      .whereIn("campaign.store_id", stores)
      .orderBy("campaign.created_at", "desc")
      .select("campaign.*", "content.title");
    for (const campaign of campaigns) {
      campaign.variants = await db("comm_variants")
        .where({ content_id: campaign.content_id })
        .orderBy("platform");
      campaign.targets = await db("comm_targets as target")
        .join("comm_connections as connection", "connection.id", "target.connection_id")
        .where({ campaign_id: campaign.id, kind: "subscribers" })
        .select("target.id", "target.connection_id", "target.state", "connection.name", "connection.platform");
      const targetConnections = campaign.targets.length
        ? await db("comm_connections").whereIn(
            "id",
            campaign.targets.map((target: any) => target.connection_id),
          )
        : [];
      campaign.estimated_recipients = (
        await eligibleRecipients(db, campaign, targetConnections)
      ).size;
      campaign.results = await db("comm_outbox")
        .where({ campaign_id: campaign.id, test_delivery: false })
        .select("state")
        .count("* as count")
        .groupBy("state");
    }
    return campaigns;
  }

  async function saveCampaign(actor: Actor, input: any) {
    return db.transaction(async (trx: Database) =>
      once(trx, actor, "campaign_save", input?.key, input, async () => {
        const connectionIds = [
          ...new Set<string>(Array.isArray(input.connection_ids) ? input.connection_ids : []),
        ];
        if (!connectionIds.length || connectionIds.some((id) => !UUID.test(id)))
          return fail("CAMPAIGN_TARGET_REQUIRED");
        const connections = await trx("comm_connections").whereIn("id", connectionIds);
        if (
          connections.length !== connectionIds.length ||
          new Set(connections.map((connection: any) => connection.store_id)).size !== 1
        )
          return fail("INVALID_CAMPAIGN_TARGETS");
        for (const connection of connections) await connectionAccess(trx, actor, connection.id);
        const variants = (Array.isArray(input.variants) ? input.variants : []).map(variant);
        for (const platform of new Set<string>(connections.map((connection: any) => connection.platform)))
          if (!variants.some((item: any) => item.platform === platform))
            return fail("CAMPAIGN_VARIANT_REQUIRED");
        const assetFileId = await image(trx, input.asset_file_id);
        if (assetFileId && connections.some((connection: any) => connection.platform !== "telegram"))
          return fail("PLATFORM_MEDIA_NOT_READY");
        const topic = text(input.topic_key, 100, true);
        if (!(await trx("comm_topics").where({ key: topic, active: true }).first()))
          return fail("INVALID_TOPIC");
        const scheduledAt = new Date(input.scheduled_at || Date.now());
        if (Number.isNaN(scheduledAt.getTime())) return fail("INVALID_SCHEDULE");
        let campaign: any;
        if (input.id) {
          if (!UUID.test(input.id)) return fail("NOT_FOUND", 404);
          campaign = await trx("comm_campaigns").where({ id: input.id }).forUpdate().first();
          if (!campaign || campaign.state !== "draft") return fail("CAMPAIGN_NOT_EDITABLE", 409);
          if (Number(input.expected_version) !== campaign.version)
            return fail("STALE_CAMPAIGN", 409);
          if (campaign.store_id !== connections[0].store_id) return fail("FORBIDDEN", 403);
          await trx("comm_content")
            .where({ id: campaign.content_id })
            .update({ title: text(input.name, 200, true) });
          await trx("comm_variants").where({ content_id: campaign.content_id }).delete();
          await trx("comm_targets")
            .where({ campaign_id: campaign.id, kind: "subscribers" })
            .delete();
          await trx("comm_campaigns")
            .where({ id: campaign.id })
            .update({
              name: text(input.name, 200, true),
              topic_key: topic,
              scheduled_at: scheduledAt,
              is_test: input.is_test !== false,
              version: trx.raw("version+1"),
              updated_at: trx.fn.now(),
            });
        } else {
          const [content] = await trx("comm_content")
            .insert({ title: text(input.name, 200, true), created_by: actor.user })
            .returning("*");
          [campaign] = await trx("comm_campaigns")
            .insert({
              name: text(input.name, 200, true),
              content_id: content.id,
              topic_key: topic,
              store_id: connections[0].store_id,
              created_by: actor.user,
              scheduled_at: scheduledAt,
              is_test: input.is_test !== false,
            })
            .returning("*");
        }
        for (const item of variants)
          await trx("comm_variants").insert({
            content_id: campaign.content_id,
            ...item,
            asset_file_id: assetFileId,
          });
        for (const connection of connections)
          await trx("comm_targets").insert({
            campaign_id: campaign.id,
            connection_id: connection.id,
            kind: "subscribers",
            state: "pending",
          });
        const current = await trx("comm_campaigns").where({ id: campaign.id }).first();
        return { ok: true, id: campaign.id, version: current.version };
      }),
    );
  }

  async function operationPayload(trx: Database, connection: any, identity: any, item: any) {
    const thread = await trx("comm_threads")
      .where({ connection_id: connection.id, identity_id: identity.id })
      .orderBy("created_at")
      .first();
    if (!thread) return fail("RECIPIENT_THREAD_REQUIRED", 409);
    const cta = callToAction(connection.platform, item.cta_label, item.cta_url);
    if (connection.platform === "telegram") {
      if (item.asset_file_id) {
        const origin = String(context.env.PUBLIC_URL || "").replace(/\/$/, "");
        if (!origin.startsWith("https://")) return fail("PUBLIC_URL_REQUIRED", 503);
        return {
          thread,
          method: "remote_image",
          payload: {
            chat_id: thread.external_peer_id,
            photo: `${origin}/assets/${item.asset_file_id}`,
            caption: item.text,
            ...cta,
          },
        };
      }
      return { thread, method: "text", payload: { chat_id: thread.external_peer_id, text: item.text, ...cta } };
    }
    if (item.asset_file_id) return fail("PLATFORM_MEDIA_NOT_READY", 409);
    if (connection.platform === "max")
      return { thread, method: "text", payload: { user_id: identity.external_user_id, text: item.text, ...cta } };
    return {
      thread,
      method: "text",
      payload: {
        peer_id: thread.external_peer_id,
        message: item.text,
        random_id: parseInt(digest(randomUUID()).slice(0, 7), 16),
        ...cta,
      },
    };
  }

  async function queue(
    trx: Database,
    campaign: any,
    connection: any,
    identity: any,
    item: any,
    testDelivery: boolean,
  ) {
    const prepared = await operationPayload(trx, connection, identity, item);
    const target = await trx("comm_targets")
      .where({ campaign_id: campaign.id, connection_id: connection.id, kind: "subscribers" })
      .first();
    const [outbox] = await trx("comm_outbox")
      .insert({
        connection_id: connection.id,
        thread_id: prepared.thread.id,
        contact_id: identity.contact_id,
        identity_id: identity.id,
        campaign_id: campaign.id,
        target_id: target.id,
        purpose: "marketing",
        state: "pending",
        test_delivery: testDelivery,
        due_at: testDelivery ? trx.fn.now() : campaign.scheduled_at,
        created_by: campaign.created_by,
        dedupe_key: `${testDelivery ? "campaign-test" : "campaign"}:${campaign.id}:identity:${identity.id}`,
      })
      .onConflict("dedupe_key")
      .ignore()
      .returning("*");
    if (outbox)
      await trx("comm_operations").insert({
        outbox_id: outbox.id,
        method: prepared.method,
        payload: prepared.payload,
      });
    return outbox;
  }

  async function action(actor: Actor, id: string, input: any) {
    return db.transaction(async (trx: Database) =>
      once(trx, actor, `campaign_${String(input?.action || "unknown")}`, input?.key, { id, ...input }, async () => {
        if (!UUID.test(id)) return fail("NOT_FOUND", 404);
        const campaign = await trx("comm_campaigns").where({ id }).forUpdate().first();
        if (!campaign) return fail("NOT_FOUND", 404);
        if (!(await memberships(trx, actor).where({ store_id: campaign.store_id }).first()))
          return fail("FORBIDDEN", 403);
        if (input.action === "review") {
          if (campaign.state !== "draft") return fail("INVALID_CAMPAIGN_STATE", 409);
          await trx("comm_campaigns")
            .where({ id })
            .update({ state: "review", version: trx.raw("version+1"), updated_at: trx.fn.now() });
        } else if (input.action === "test") {
          if (!["draft", "review"].includes(campaign.state))
            return fail("INVALID_CAMPAIGN_STATE", 409);
          if (typeof input.identity_id !== "string" || !UUID.test(input.identity_id))
            return fail("TEST_RECIPIENT_REQUIRED");
          const identity = await trx("comm_identities").where({ id: input.identity_id }).first();
          const connection = identity
            ? await trx("comm_connections").where({ id: identity.connection_id, enabled: true }).first()
            : null;
          if (
            !connection ||
            connection.store_id !== campaign.store_id ||
            !pilotRecipient(connection, identity)
          )
            return fail("TEST_RECIPIENT_NOT_ALLOWED", 403);
          const target = await trx("comm_targets")
            .where({ campaign_id: id, connection_id: connection.id, kind: "subscribers" })
            .first();
          const item = await trx("comm_variants")
            .where({ content_id: campaign.content_id, platform: connection.platform })
            .first();
          if (!target || !item) return fail("CAMPAIGN_VARIANT_REQUIRED");
          await queue(trx, campaign, connection, identity, item, true);
        } else if (input.action === "approve") {
          if (campaign.state !== "review" || input.confirm !== true)
            return fail("CAMPAIGN_APPROVAL_REQUIRED", 409);
          if (!(await memberships(trx, actor, true).where({ store_id: campaign.store_id }).first()))
            return fail("FORBIDDEN", 403);
          const targets = await trx("comm_targets").where({ campaign_id: id, kind: "subscribers" });
          const connections = await trx("comm_connections").whereIn(
            "id",
            targets.map((target: any) => target.connection_id),
          );
          if (connections.some((connection: any) => !connection.enabled || !connection.marketing_enabled))
            return fail("MARKETING_DISABLED", 409);
          const variants = await trx("comm_variants").where({ content_id: campaign.content_id });
          const recipients = await eligibleRecipients(trx, campaign, connections);
          const snapshot = {
            name: campaign.name,
            topic_key: campaign.topic_key,
            scheduled_at: campaign.scheduled_at,
            variants,
            connection_ids: connections.map((connection: any) => connection.id),
            estimated_recipients: recipients.size,
          };
          await trx("comm_campaigns")
            .where({ id })
            .update({
              state: "sending",
              approved_by: actor.user,
              approved_at: trx.fn.now(),
              snapshot,
              version: trx.raw("version+1"),
              updated_at: trx.fn.now(),
            });
          for (const identity of recipients.values()) {
            const connection = connections.find((candidate: any) => candidate.id === identity.connection_id);
            const item = variants.find((candidate: any) => candidate.platform === connection.platform);
            if (!item) return fail("CAMPAIGN_VARIANT_REQUIRED");
            await queue(trx, campaign, connection, identity, item, false);
          }
          if (!recipients.size)
            await trx("comm_campaigns").where({ id }).update({ state: "completed" });
        } else if (input.action === "cancel") {
          if (["completed", "cancelled"].includes(campaign.state))
            return fail("INVALID_CAMPAIGN_STATE", 409);
          await trx("comm_outbox")
            .where({ campaign_id: id })
            .whereIn("state", ["pending", "sending"])
            .update({ state: "cancelled", error_code: "CAMPAIGN_CANCELLED" });
          await trx("comm_operations")
            .whereIn(
              "outbox_id",
              trx("comm_outbox").where({ campaign_id: id, state: "cancelled" }).select("id"),
            )
            .where({ state: "pending" })
            .update({ state: "cancelled", error_code: "CAMPAIGN_CANCELLED" });
          await trx("comm_campaigns")
            .where({ id })
            .update({ state: "cancelled", version: trx.raw("version+1"), updated_at: trx.fn.now() });
        } else return fail("UNKNOWN_COMMAND");
        return { ok: true, id, action: input.action };
      }),
    );
  }

  async function finishCampaign(trx: Database, campaignId: string) {
    const active = await trx("comm_outbox")
      .where({ campaign_id: campaignId, test_delivery: false })
      .whereNotIn("state", terminalStates)
      .first();
    if (!active)
      await trx("comm_campaigns")
        .where({ id: campaignId, state: "sending" })
        .update({ state: "completed", updated_at: trx.fn.now() });
  }

  return { overview, updateConnection, listCampaigns, saveCampaign, action, finishCampaign };
}
