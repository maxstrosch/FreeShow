<script lang="ts">
    import { onMount } from "svelte"
    import { Main } from "../../../../types/IPC/Main"
    import { requestMain } from "../../../IPC/main"
    import InputRow from "../../input/InputRow.svelte"
    import Title from "../../input/Title.svelte"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import MaterialTextInput from "../../inputs/MaterialTextInput.svelte"
    import Tip from "../../main/Tip.svelte"

    let baseUrl = ""
    let token = ""
    let configured = false
    let saving = false
    let message = ""
    let error = false

    onMount(async () => {
        const status = await requestMain(Main.CHURCHTOOLS_CALENDAR_STATUS)
        configured = !!status?.configured
        baseUrl = status?.baseUrl || ""
    })

    async function saveSettings() {
        saving = true
        message = ""
        error = false
        const result = await requestMain(Main.CHURCHTOOLS_CALENDAR_SAVE, { baseUrl, token })
        saving = false
        if (result?.success) {
            configured = true
            token = ""
            message = "ChurchTools-Verbindung wurde sicher gespeichert."
        } else {
            error = true
            message = result?.error || "Einstellungen konnten nicht gespeichert werden."
        }
    }
</script>

<Title label="ChurchTools" icon="calendar" />

{#if configured}
    <Tip type="success" value="ChurchTools ist eingerichtet. Der API-Token wird verschlüsselt lokal gespeichert und aus Sicherheitsgründen nicht erneut angezeigt." top={5} />
{:else}
    <Tip type="info" value="Verbinde FreeShow mit deiner ChurchTools-Installation, um Kalendertermine und Veranstaltungs-Agenden zu verwenden." top={5} />
{/if}

<MaterialTextInput label="ChurchTools-URL" value={baseUrl} placeholder="https://gemeinde.church.tools" on:change={(e) => (baseUrl = e.detail)} />
<MaterialTextInput label="API-Token" value={token} placeholder={configured ? "Token erneut eingeben, um Zugangsdaten zu aktualisieren" : "ChurchTools API-Token"} on:change={(e) => (token = e.detail)} />

<InputRow>
    <MaterialButton style="flex: 1;" icon="save" disabled={saving || !baseUrl.trim() || !token.trim()} on:click={saveSettings}>
        {saving ? "Speichern …" : "Verbindung speichern"}
    </MaterialButton>
</InputRow>

{#if message}
    <Tip type={error ? "warning" : "success"} value={message} top={8} />
{/if}
