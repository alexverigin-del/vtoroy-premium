const enabled = value => value === true || value === 'true';

/** Lazy loading keeps the legacy extension independently testable while production builds
 * receive the bundled adapter from the sibling communications extension. */
export function createCompatibilityHandlers(context) {
  if (!enabled(context.env.ISVOI_TELEGRAM_USE_COMMUNICATIONS)) return null;
  let handlers;
  const load = async () => {
    if (!handlers) {
      const module = await import('../../directus-extension-isvoi-communications/dist/legacy.js');
      handlers = module.createLegacyTelegramCompatibility(context);
    }
    return handlers;
  };
  return Object.fromEntries(
    ['session', 'next', 'complete', 'update', 'intake', 'intake-check'].map(name => [
      name,
      async req => {
        try {
          return await (await load())[name](req);
        } catch (error) {
          if (
            error?.constructor?.name === 'CommunicationError' &&
            /^[A-Z][A-Z0-9_]{2,100}$/.test(error.code || '') &&
            Number.isInteger(error.status) &&
            error.status >= 400 &&
            error.status <= 599
          ) error.publicCode = error.code;
          throw error;
        }
      },
    ]),
  );
}
