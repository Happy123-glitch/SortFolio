// ==============================================================================
// Supabase Edge Function: chat-assistant
// Conversational Triage Assistant for Open-Source Maintainers
// ==============================================================================

import { corsHeaders } from '../_shared/cors.ts';
import { answerTriageQueryWithModel } from '../_shared/model-provider.ts';

export async function handleChatAssistant(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let body: { message: string; report: any };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON request payload.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { message, report } = body;
  if (!message || typeof message !== 'string') {
    return new Response(
      JSON.stringify({ error: 'Missing required field: "message".' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!report || !report.repo || !report.claims) {
    return new Response(
      JSON.stringify({ error: 'Missing required triage report context.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const result = await answerTriageQueryWithModel(message, {
      repo: report.repo,
      itemNumber: report.number || report.item_number || 1,
      title: report.title || report.metadata?.title,
      claims: report.claims,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

if (typeof Deno !== 'undefined' && Deno.serve) {
  Deno.serve(handleChatAssistant);
}
