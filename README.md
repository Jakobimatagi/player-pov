# POV Playbook

Replay a football play in 3D from any player's helmet camera.

```bash
npm install
npm run dev
```

`npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` are the checks CI runs.

Python parity with `schema/validate.py` needs the `jsonschema` module:

```bash
pip install -r schema/requirements.txt
```

If that module is missing, those tests skip and print that install command.
