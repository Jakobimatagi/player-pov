"""Put pgTAP fixture teams on a paid plan (issue #63, step 4).

Starter limits (1 coach, 15 plays, no film, ...) would stop most feature tests at their
setup. After every `insert into public.teams ...;` in a test file this adds one statement
that gives each new team its own manual Program plan. Billing and limit tests are skipped:
they need Starter teams. Running it twice changes nothing.

    python3 scripts/paid-test-fixtures.py supabase/tests/*.test.sql
"""

import re
import sys

SKIP = {'billing.test.sql', 'billing_webhook.test.sql', 'team_billing.test.sql', 'plan_limits.test.sql'}
MARK = '-- Paid plan for these fixtures; Starter limits are tested in plan_limits.test.sql.'
FIXTURE = f"""{MARK}
do $paid$
declare
  r record;
  account uuid;
begin
  for r in select id from public.teams where billing_account_id is null loop
    insert into public.billing_accounts (plan, manual_until) values ('program', 'infinity')
    returning id into account;
    update public.teams set billing_account_id = account where id = r.id;
  end loop;
end $paid$;
"""

START = re.compile(r'^\s*insert into public\.teams\b', re.IGNORECASE)


def rewrite(text: str) -> str:
    if MARK in text:
        return text
    out, inside = [], False
    for line in text.splitlines(keepends=True):
        out.append(line)
        if START.match(line):
            inside = True
        if inside and line.rstrip().endswith(';'):
            out.append(FIXTURE)
            inside = False
    return ''.join(out)


changed = 0
for path in sys.argv[1:]:
    if path.rsplit('/', 1)[-1] in SKIP:
        continue
    with open(path) as f:
        before = f.read()
    after = rewrite(before)
    if after != before:
        with open(path, 'w') as f:
            f.write(after)
        changed += 1
        print(f'updated {path}')
print(f'{changed} files updated')
