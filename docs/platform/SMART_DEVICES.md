# Kleenest Smart Devices

Kleenest Smart Devices is a provider-neutral control plane for connected facilities. It is designed so restroom and facility hardware can evolve without changing the Business, Fleet, KleenestOS, Partner API, webhook, or MCP contracts.

## Integration model

Kleenest does **not** embed vendor passwords, broker credentials, or device secrets in Business or Consumer clients. Hardware connects through a bridge identity linked to a Kleenest Partner Platform workspace.

Supported connector classes are:

- **Matter bridge** — a local or cloud Matter controller translates Matter device state and actions into the Kleenest device contract.
- **MQTT bridge** — an MQTT gateway owns broker credentials locally and translates topics into Kleenest events/commands.
- **Vendor cloud** — a manufacturer or facilities platform uses Kleenest REST/webhooks to exchange telemetry and commands.
- **Generic gateway** — a custom edge gateway implements the same contract.
- **Manual** — useful for pilots and deterministic testing before hardware is paired.

This bridge model keeps local-network and vendor credentials outside Kleenest while allowing one canonical device model.

## Core objects

`smart_device_connectors` represents the bridge/provider relationship.
`smart_devices` stores canonical device identity, Business/location ownership, current health, and **declared capabilities**.
`smart_device_events` stores short-lived raw telemetry and alerts. Raw event retention defaults to **7 days** to protect database capacity.
`smart_device_commands` is the idempotent command queue and operational audit trail.
`smart_device_automation_rules` maps safe events/thresholds to commands with cooldown protection.

## Least privilege

A device can only execute a command if its capability list contains `command:<name>` or `command:*`. Merely connecting a bridge never enables control.
Connector control and device control are separate gates and both must be enabled.
High-risk commands such as door unlocking, access-control changes, alarm/safety disabling, factory reset, and firmware update are held in `pending_approval` unless issued by KleenestOS platform-owner authority. High-risk commands cannot be automated.

Partner API scopes are independent: `devices:read`, `devices:write`, `devices:command`, and `devices:events:write`. The `smart_devices` API product is delivered through the **Smart Facilities** product bundle.

## Command lifecycle

1. Business, KleenestOS, Partner API, or MCP requests a command with an **idempotent** key.
2. Kleenest verifies authority, connector + device control gates, and the declared device capability.
3. The command is queued, or held for owner approval when high-risk.
4. The Smart Device gateway claims queued commands.
5. The gateway emits a signed `device.command_requested` webhook through the existing durable Partner Platform webhook worker.
6. The bridge performs the physical action and reports completion.
7. Kleenest records completion/failure and emits `device.command_completed`.

Commands expire if a bridge does not claim them in time.

## Telemetry and events

Bridges publish normalized events with an external device ID, event type, severity, optional metric/value/unit, and vendor-specific payload. Events can produce `device.status_changed`, `device.alert`, and `device.telemetry_threshold`.
Automations may match event type, device status, or numeric metric thresholds.
For high-volume deployments, use aggregation at the bridge and send meaningful state changes or time-window summaries rather than every raw sample. Supabase Realtime Broadcast can distribute low-latency UI state, but raw sensor history remains governed by the Kleenest retention policy.

## Example device capabilities

A soap dispenser might advertise `read:level`, `read:battery`, `command:dispense`, and `command:calibrate`. An occupancy sensor may be read-only. A leak sensor may emit alerts and have no commands at all.

## Operations surfaces

**Kleenest Business → Smart Devices** supports connector/device registration, Device health, declared commands, safe automations, and recent signals.
**KleenestOS → IoT & Smart Devices** provides global Connector health, fleet state, high-risk command approvals, Command audit/failures, and critical-event visibility.
**Partner Platform** provides REST device listing, event ingestion, command queueing/completion, signed webhooks, and MCP tools.

## Adapter/plugin contract

A future hardware adapter only needs to implement four behaviors: map vendor/Matter/MQTT identity to `externalDeviceId`; map sensor state to the normalized event contract; consume signed `device.command_requested` webhooks; and report command completion.
This is the plugin boundary. Vendor-specific SDKs belong in the bridge/adapter, not the Kleenest core.

## Safety and reliability

- no direct device secrets in clients;
- RLS on all exposed tables;
- server-only partner/worker operations;
- explicit control enablement;
- least privilege command capability declarations;
- idempotent command requests and short command expiry;
- high-risk approval gate and no high-risk automation;
- automation cooldowns;
- signed webhook delivery with retry/dead-letter behavior;
- short raw telemetry retention with durable command audit.

## Future extensions

The schema leaves room for digital twins, firmware inventory, predictive maintenance, occupancy models, consumable forecasting, energy/water telemetry, offline bridge queues, device certificates, and location-level Smart Bathroom scoring without changing the public command/event contract.