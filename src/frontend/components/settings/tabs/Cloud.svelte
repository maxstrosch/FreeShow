<script lang="ts">
    import { onMount } from "svelte"
    import { Main } from "../../../../types/IPC/Main"
    import { requestMain } from "../../../IPC/main"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import MaterialTextInput from "../../inputs/MaterialTextInput.svelte"
    import InputRow from "../../input/InputRow.svelte"
    import Title from "../../input/Title.svelte"

    let baseUrl = ""
    let token = ""
    let eventId = ""
    let events: any[] = []
    let agenda: any[] = []
    let status = ""
    let busy = false

    onMount(async () => {
        const saved = await requestMain(Main.GET_STORE_VALUE, { file: "ACCESS", key: "contentProviders.churchTools" })
        if (saved) {
            baseUrl = saved.baseUrl || ""
            token = saved.token || ""
        }
    })

    async function saveCredentials() {
        await requestMain(Main.SET_STORE_VALUE, { file: "ACCESS", key: "churchTools", value: { baseUrl: baseUrl.trim(), token: token.trim() } })
        status = "Zugangsdaten lokal gespeichert."
    }

    async function testConnection() {
        busy = true
        status = ""
        try {
            const result = await requestMain(Main.CHURCHTOOLS_TEST, { baseUrl, token })
            status = result?.message || "Keine Rückmeldung."
            if (result?.success) await saveCredentials()
        } catch (error: any) {
            status = error?.message || "Verbindung fehlgeschlagen."
        }
        busy = false
    }

    async function loadEvents() {
        busy = true
        status = ""
        try {
            events = await requestMain(Main.CHURCHTOOLS_EVENTS, { baseUrl, token }) || []
            status = events.length ? `${events.length} Events geladen.` : "Keine Events gefunden. Bitte API-Berechtigung und Event-Endpunkt prüfen."
            await saveCredentials()
        } catch (error: any) {
            status = error?.message || "Events konnten nicht geladen werden."
        }
        busy = false
    }

    async function loadAgenda() {
        busy = true
        status = ""
        try {
            const result = await requestMain(Main.CHURCHTOOLS_AGENDA, { baseUrl, token, eventId })
            agenda = result?.items || []
            status = `${agenda.length} Programmpunkte geladen.`
        } catch (error: any) {
            status = error?.message || "Ablaufplan konnte nicht geladen werden."
        }
        busy = false
    }

    function eventLabel(event: any) {
        return event.name || event.title || `Event ${event.id}`
    }
</script>

<Title label="ChurchTools" icon="cloud" />
<p>Verbinde FreeShow mit dem ChurchTools-Events-Modul, um Gottesdienst-Events und deren Ablaufpläne abzurufen.</p>

<InputRow>
    <MaterialTextInput label="ChurchTools-URL" bind:value={baseUrl} placeholder="https://gemeinde.church.tools" />
</InputRow>
<InputRow>
    <MaterialTextInput label="Login-Token" bind:value={token} placeholder="ChurchTools Login-Token" type="password" />
</InputRow>
<InputRow>
    <MaterialButton on:click={testConnection} disabled={busy || !baseUrl || !token}>Verbindung testen</MaterialButton>
    <MaterialButton on:click={loadEvents} disabled={busy || !baseUrl || !token}>Events laden</MaterialButton>
</InputRow>
{#if status}<p role="status">{status}</p>{/if}

{#if events.length}
    <Title label="Events" icon="calendar" />
    {#each events as event}
        <InputRow>
            <MaterialButton style="flex:1;justify-content:flex-start;" on:click={() => (eventId = String(event.id))} isActive={eventId === String(event.id)}>
                {eventLabel(event)}
            </MaterialButton>
        </InputRow>
    {/each}
{/if}

{#if events.length || eventId}
    <InputRow>
        <MaterialTextInput label="Event-ID" bind:value={eventId} placeholder="ChurchTools Event-ID" />
        <MaterialButton on:click={loadAgenda} disabled={busy || !eventId}>Ablaufplan laden</MaterialButton>
    </InputRow>
{/if}

{#if agenda.length}
    <Title label="Ablaufplan-Vorschau" icon="list" />
    {#each agenda as item}
        <InputRow>
            <div style="flex:1;">
                <strong>{item.type === "song" ? item.song?.title || item.title : item.title}</strong>
                {#if item.type}<span style="opacity:0.6;margin-left:8px;">{item.type}</span>{/if}
                {#if item.duration}<span style="opacity:0.6;margin-left:8px;">{Math.round(item.duration / 60)} min</span>{/if}
                {#if item.responsible?.text}<div style="opacity:0.65;font-size:0.9em;">{item.responsible.text}</div>{/if}
                {#if item.note}<div style="opacity:0.65;font-size:0.9em;">{item.note}</div>{/if}
            </div>
        </InputRow>
    {/each}
{/if}
