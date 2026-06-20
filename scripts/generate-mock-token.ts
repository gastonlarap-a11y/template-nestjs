/**
 * Local mock JWT generator — `pnpm run auth:token`.
 *
 * Signs an HS256 token with `LOCAL_JWT_SECRET` whose payload mirrors an Azure AD
 * (Entra ID) v2.0 access token (`sub`, `oid`, `tid`, `email`, `roles`, ...). The
 * dual-mode JWT strategy accepts it when `USE_LOCAL_MOCK_AUTH=true`, so you can
 * exercise RBAC-protected endpoints from Swagger with **no live tenant**.
 *
 * Usage:
 *   pnpm run auth:token                          # default Admin token
 *   pnpm run auth:token -- --roles=UserManager   # custom roles (comma list)
 *   pnpm run auth:token -- --email=me@corp.com --name="Me" --expiresIn=7200
 */
import { randomUUID } from 'node:crypto';

import jwt from 'jsonwebtoken';

/** Minimal `--key=value` / `--flag` argument parser. */
function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (match) args[match[1]] = match[2] ?? 'true';
  }
  return args;
}

function main(): void {
  const secret = process.env.LOCAL_JWT_SECRET;
  if (!secret) {
    console.error(
      '❌ LOCAL_JWT_SECRET is not set. Add it to your .env (USE_LOCAL_MOCK_AUTH=true).',
    );
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));

  const sub = args.sub ?? randomUUID();
  const email = args.email ?? 'admin@example.com';
  const name = args.name ?? 'Template Admin';
  const roles = (args.roles ?? 'Admin').split(',').map((r) => r.trim());
  const expiresIn = Number(
    args.expiresIn ?? process.env.LOCAL_JWT_EXPIRES_IN ?? 3600,
  );
  const tenantId = process.env.AZURE_AD_TENANT_ID ?? 'local-mock-tenant';

  // Shape mirrors an Entra ID v2.0 access token.
  const payload = {
    sub,
    oid: sub,
    tid: tenantId,
    email,
    preferred_username: email,
    name,
    roles,
    ver: '2.0',
    iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    aud: process.env.AZURE_AD_AUDIENCE ?? 'api://local-mock',
  };

  const token = jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn });

  console.log('\n✅ Mock JWT generated (HS256, local-mock auth)\n');
  console.log(`   roles:    ${roles.join(', ')}`);
  console.log(`   email:    ${email}`);
  console.log(`   expires:  ${expiresIn}s\n`);
  console.log('— Token —');
  console.log(token);
  console.log('\n— Paste into Swagger "Authorize", or use the header —');
  console.log(`Authorization: Bearer ${token}\n`);
}

main();
