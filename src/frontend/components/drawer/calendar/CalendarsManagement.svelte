<script lang="ts">
    import { calendars, events, special } from "../../../stores"
    import { Main } from "../../../../types/IPC/Main"
    import { requestMain } from "../../../IPC/main"
    import { newToast } from "../../../utils/common"
    import { translateText } from "../../../utils/language"
    import Icon from "../../helpers/Icon.svelte"
    import T from "../../helpers/T.svelte"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import { fetchAndImportIcs, getIcsCalendars, isCalendarHidden, toggleCalendarHidden, type IcsCalendar } from "./calendars"

    let syncingCalendars: Record<string, boolean> = {}
    let churchToolsUrl = ""
    let churchToolsToken = ""
    let churchToolsConfigured = false
    let churchToolsBusy = false

    async function loadChurchToolsStatus() {
        const status = await requestMain(Main.CHURCHTOOLS_CALENDAR_STATUS)
        churchToolsConfigured = !!status?.configured
        churchToolsUrl = status?.baseUrl || ""
    }

    async function saveChurchTools() {
        churchToolsBusy = true
        const result = await requestMain(Main.CHURCHTOOLS_CALENDAR_SAVE, { baseUrl: churchToolsUrl, token: churchToolsToken })
        churchToolsBusy = false
        if (!result?.success) { newToast(result?.error || "ChurchTools konnte nicht gespeichert werden."); return }
        churchToolsToken = ""
        churchToolsConfigured = true
        await syncChurchTools()
    }

    async function syncChurchTools() {
        if (churchToolsBusy) return
        churchToolsBusy = true
        const result = await requestMain(Main.CHURCHTOOLS_CALENDAR_SYNC, {})
        churchToolsBusy = false
        if (!result?.success) { newToast(result?.error || "ChurchTools-Synchronisierung fehlgeschlagen."); return }
        calendars.update((all) => {
            for (const cal of result.calendars || []) {
                const id = "churchtools:" + cal.id
                all[id] = { ...(all[id] || {}), id, name: cal.name, color: all[id]?.color || cal.color, custom: false, lastSynced: Date.now() }
            }
            return all
        })
        events.update((all) => {
            for (const [id, event] of Object.entries(all)) if (typeof event.origin === "string" && event.origin.startsWith("churchtools:")) delete all[id]
            Object.assign(all, result.events || {})
            return all
        })
    }

    loadChurchToolsStatus()

    $: icsCalendars = getIcsCalendars($events, $calendars)

    async function syncCalendar(cal: IcsCalendar) {
        if (!cal.url || syncingCalendars[cal.id]) return

        syncingCalendars[cal.id] = true
        const success = await fetchAndImportIcs(cal.url, cal.id)
        syncingCalendars[cal.id] = false

        if (success !== true) {
            let msg = "error.import"
            if (typeof success === "string") msg = success
            newToast(msg)
            return
        }
    }
</script>

<!-- TODO: export specific calendar (from context menu) -->

<div class="calendars-section" style="margin-top: 10px;">
    <p class="section-title">ChurchTools</p>
    <div class="calendar-list" style="padding: 6px;">
        <input class="input" placeholder="https://gemeinde.church.tools" bind:value={churchToolsUrl} />
        <input class="input" type="password" placeholder={churchToolsConfigured ? "Neuen API-Token eingeben (optional)" : "ChurchTools API-Token"} bind:value={churchToolsToken} />
        <div class="calendar-actions">
            <MaterialButton title="Speichern" disabled={churchToolsBusy || !churchToolsUrl || (!churchToolsConfigured && !churchToolsToken)} on:click={saveChurchTools}><T id="actions.save" /></MaterialButton>
            {#if churchToolsConfigured}<MaterialButton title="ChurchTools synchronisieren" disabled={churchToolsBusy} on:click={syncChurchTools}><Icon id="refresh" class={churchToolsBusy ? "spinning" : ""} white /></MaterialButton>{/if}
        </div>
    </div>
</div>

{#if icsCalendars.length > 0}
    <div class="calendars-section" style="margin-top: 10px;">
        <p class="section-title"><T id="calendar.calendars" /></p>

        <div class="calendar-list">
            {#each icsCalendars as cal}
                {@const isHidden = isCalendarHidden($calendars, $special?.hideUnlabeledCalendar, cal.unassigned ? undefined : cal.id)}

                <div class="calendar-card context {cal.unassigned ? '#calendar_item_unlabeled' : '#calendar_item'}" id={cal.id}>
                    <div class="calendar-info">
                        <span class="calendar-color-dot" style="background-color: {cal.unassigned ? 'rgb(255 255 255 / 0.2)' : cal.color || '#FF5733'};" />

                        <div class="calendar-title-col">
                            <p class="calendar-name" data-title={cal.url || cal.name}>{cal.name}</p>
                            <span class="calendar-desc">
                                {#if cal.url}<Icon id="web" size={0.6} white />{/if}
                                <p>{translateText("category.events")}: {cal.count}</p>
                            </span>
                        </div>
                    </div>

                    <div class="calendar-actions">
                        {#if cal.url}
                            <MaterialButton title="cloud.sync" disabled={syncingCalendars[cal.id]} style="padding: 10px;" on:click={() => syncCalendar(cal)}>
                                <Icon id="refresh" class={syncingCalendars[cal.id] ? "spinning" : ""} white />
                            </MaterialButton>
                        {/if}

                        <MaterialButton title={isHidden ? "profile.show" : "profile.hide"} style="padding: 10px;" on:click={() => toggleCalendarHidden(cal.id)}>
                            <Icon id={isHidden ? "hide" : "eye"} white={isHidden} />
                        </MaterialButton>
                    </div>
                </div>
            {/each}
        </div>
    </div>
{/if}

<style>
    .calendars-section {
        display: flex;
        flex-direction: column;
        gap: 5px;

        background-color: var(--primary-darkest);
        border-radius: 4px;
        padding: 8px;
    }

    .section-title {
        font-size: 0.85em;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        opacity: 0.7;
    }

    .calendar-list {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .calendar-card {
        display: flex;
        justify-content: space-between;

        background-color: var(--primary-darker);
        border-radius: 4px;
        padding: 6px 8px;

        transition: background-color 0.15s;
    }
    .calendar-card:hover {
        background-color: var(--hover);
    }

    .calendar-info {
        display: flex;
        align-items: center;
        gap: 10px;

        max-width: 70%;
    }

    .calendar-color-dot {
        width: 11px;
        height: 11px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .calendar-title-col {
        display: flex;
        flex-direction: column;

        max-width: 100%;
    }

    .calendar-name {
        font-weight: 500;
        font-size: 0.9em;
    }

    .calendar-desc {
        display: flex;
        align-items: center;
        gap: 4px;

        font-size: 0.75em;
        opacity: 0.6;
    }

    .calendar-actions {
        display: flex;
        align-items: center;
        gap: 2px;
    }

    .calendar-actions :global(.spinning) {
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        100% {
            transform: rotate(360deg);
        }
    }
</style>
