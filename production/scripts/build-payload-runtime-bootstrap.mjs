import {
  DEFAULT_PAYLOAD_RUNTIME_COMPOSE_FILE,
  DEFAULT_PAYLOAD_RUNTIME_ENV_EXAMPLE,
  payloadRuntimeBootstrapChecklist,
  writePayloadRuntimeBootstrap,
} from "../lib/payload-runtime-bootstrap.mjs";

const result = writePayloadRuntimeBootstrap({
  composePath: process.env.MS_REALTY_PAYLOAD_RUNTIME_COMPOSE_PATH || DEFAULT_PAYLOAD_RUNTIME_COMPOSE_FILE,
  envExamplePath: process.env.MS_REALTY_PAYLOAD_RUNTIME_ENV_EXAMPLE_PATH || DEFAULT_PAYLOAD_RUNTIME_ENV_EXAMPLE,
});

console.log(`Wrote Payload runtime env example to ${result.envExamplePath}`);
console.log(`Wrote Payload runtime compose file to ${result.composePath}`);
for (const line of payloadRuntimeBootstrapChecklist()) {
  console.log(line);
}
