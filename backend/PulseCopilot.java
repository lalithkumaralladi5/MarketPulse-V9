import com.sun.net.httpserver.HttpExchange;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

/** Read-only local analytics explainer, optional opt-in LLM. No broker-trade functions. */
public final class PulseCopilot {
    private static final String OPENAI_KEY = System.getenv().getOrDefault("OPENAI_API_KEY", "").trim();
    private static final String OPENAI_MODEL = System.getenv().getOrDefault("OPENAI_MODEL", "gpt-4.1-mini").trim();
    private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private static final AtomicLong LAST_REQUEST = new AtomicLong();
    static boolean cloudEnabled() { return !OPENAI_KEY.isBlank(); }

    static void handle(HttpExchange ex) throws IOException {
        if (!"POST".equals(ex.getRequestMethod())) { MarketPulseServer.send(ex, 405, Map.of("error", "POST required")); return; }
        String origin = ex.getRequestHeaders().getFirst("Origin");
        String host = ex.getRequestHeaders().getFirst("Host");
        if (host == null || !(host.matches("127\\.0\\.0\\.1(:[0-9]+)?") || host.matches("localhost(:[0-9]+)?")) ||
            (origin != null && !origin.equals("http://"+host)) ||
            !"marketpulse-v5".equals(ex.getRequestHeaders().getFirst("X-MarketPulse-Client"))) {
            MarketPulseServer.send(ex, 403, Map.of("error", "Local application request required")); return;
        }
        long now = System.currentTimeMillis();
        long prev = LAST_REQUEST.getAndSet(now);
        if (now-prev < 900) { MarketPulseServer.send(ex, 429, Map.of("error", "Give the copilot a moment between messages")); return; }
        int declared = 0;
        try { declared = Integer.parseInt(ex.getRequestHeaders().getFirst("Content-Length")); } catch(Exception ignored) {}
        if (declared > 15000) { MarketPulseServer.send(ex, 413, Map.of("error", "Request too large")); return; }
        byte[] raw = ex.getRequestBody().readNBytes(15001);
        if (raw.length > 15000) { MarketPulseServer.send(ex, 413, Map.of("error", "Request too large")); return; }
        Map<String,Object> req;
        try { req = MarketPulseServer.asMap(MarketPulseServer.Json.parse(new String(raw, StandardCharsets.UTF_8))); }
        catch(Exception e) { MarketPulseServer.send(ex, 400, Map.of("error", "Invalid JSON")); return; }
        String question = MarketPulseServer.str(req.get("question")).strip();
        if (question.isBlank() || question.length() > 500) { MarketPulseServer.send(ex, 400, Map.of("error", "Ask a question up to 500 characters")); return; }
        String route = MarketPulseServer.str(req.get("engine"));
        Map<String,Object> context = sanitizedContext(MarketPulseServer.asMap(req.get("context")));
        if ("cloud".equals(route)) {
            if (!cloudEnabled()) { MarketPulseServer.send(ex, 400, Map.of("error", "Cloud AI is not configured. The local copilot works without a key.")); return; }
            try {
                String answer = cloudAnswer(question, context);
                MarketPulseServer.send(ex, 200, Map.of("engine", "cloud-ai", "answer", answer, "readOnly", true));
            } catch(Exception e) {
                System.err.println("Optional AI request failed: " + e.getClass().getSimpleName());
                MarketPulseServer.send(ex, 502, Map.of("error", "AI provider unavailable. Switch to Local explanation mode; market data and tokens were not exposed in the error."));
            }
        } else {
            MarketPulseServer.send(ex, 200, Map.of("engine", "local-explainer", "answer", localAnswer(question, context), "readOnly", true));
        }
    }
    private static Map<String,Object> sanitizedContext(Map<String,Object> a) {
        Map<String,Object> c = new LinkedHashMap<>();
        for(String k : List.of("mode","provider","asOf","underlying","exchange","symbol","expiry","strike","type","signal","alignmentScore","premium","bid","ask","spreadPct","oi","oiChangePct","iv","delta","theta","source"))
            if(a.containsKey(k)) c.put(k, limited(a.get(k)));
        for(String k : List.of("indicators","dataQuality","risk","depth")) {
            Map<String,Object> src = MarketPulseServer.asMap(a.get(k)); Map<String,Object> safe = new LinkedHashMap<>();
            List<String> allowed = switch(k) {
                case "indicators" -> List.of("ema9","ema21","rsi14","vwap","atr14","relativeVolume","underlyingEma9","underlyingEma21");
                case "dataQuality" -> List.of("fresh","snapshotFresh","withinNormalHours","enoughHistory","quoteAgeSeconds","snapshotAgeSeconds","holidayVerified");
                case "risk" -> List.of("entryReference","illustrativeStop","illustrativeTarget1","illustrativeTarget2","riskPerUnit");
                default -> List.of("buyQty","sellQty","imbalance");
            };
            for(String field:allowed)if(src.containsKey(field))safe.put(field,limited(src.get(field)));
            c.put(k,safe);
        }
        Map<String,Object> checks = MarketPulseServer.asMap(a.get("checks"));
        Map<String,Object> permittedChecks = new LinkedHashMap<>();
        for(var e:checks.entrySet())if(permittedChecks.size()<12)permittedChecks.put(e.getKey().substring(0,Math.min(85,e.getKey().length())),Boolean.TRUE.equals(e.getValue()));
        c.put("checks",permittedChecks);
        List<String> reasons = new ArrayList<>();
        for(Object reason:MarketPulseServer.asList(a.get("reasons")))if(reasons.size()<10)reasons.add(MarketPulseServer.str(reason).substring(0,Math.min(180,MarketPulseServer.str(reason).length())));
        c.put("reasons",reasons);
        List<String> headlines=new ArrayList<>();
        for(Object raw:MarketPulseServer.asList(a.get("newsHeadlines"))){String line=MarketPulseServer.str(raw);if(headlines.size()>=5)break;headlines.add(line.substring(0,Math.min(140,line.length())));}
        c.put("newsHeadlines",headlines);
        return c;
    }
    private static Object limited(Object o) {
        if(o instanceof Number || o instanceof Boolean) return o;
        String v = MarketPulseServer.str(o);
        return v.length()>100?v.substring(0,100):v;
    }
    private static String localAnswer(String question, Map<String,Object> a) {
        if(!a.containsKey("signal"))return "Select a CE or PE contract first. I can then explain its momentum checklist, bid/ask pressure, entry/stop reference levels, market freshness and scenario risks. This is research, not a prediction.";
        if(a.containsKey("symbol")&&!a.containsKey("strike")) {
            Map<String,Object> ind=MarketPulseServer.asMap(a.get("indicators"));
            Map<String,Object> quality=MarketPulseServer.asMap(a.get("dataQuality"));
            List<Object> news=MarketPulseServer.asList(a.get("newsHeadlines"));
            String freshness=Boolean.TRUE.equals(quality.get("fresh"))?"recent provider quote":"stale, unavailable or synthetic quote";
            String overview=a.get("symbol")+" · "+a.getOrDefault("mode","DEMO")+" · "+freshness+". " +
                "Latest recorded price ₹"+n(a.get("premium"))+", EMA9 ₹"+n(ind.get("ema9"))+", EMA21 ₹"+n(ind.get("ema21"))+", session VWAP ₹"+n(ind.get("vwap"))+", RSI14 "+n(ind.get("rsi14"))+". " +
                "Chart classification: "+a.getOrDefault("signal","WAIT")+". This is not a proven buy/sell model; news and quotes may be delayed. ";
            if(question.toLowerCase(Locale.ROOT).matches(".*(news|headline|event|sentiment).*"))return overview+(news.isEmpty()?"No Upstox headlines have been fetched for this instrument yet. Open News Intelligence first.":"Recent provider headlines (not verified sentiment scores): "+String.join("; ",news.stream().map(String::valueOf).toList())) ;
            return overview+"Displayed depth, OI and chart momentum are different measurements. Confirm quote timestamps, spread, liquidity and risks before treating any setup as actionable.";
        }
        String q = question.toLowerCase(Locale.ROOT);
        String kind = MarketPulseServer.str(a.getOrDefault("type","option"));
        String label = MarketPulseServer.str(a.getOrDefault("underlying","index"))+" "+MarketPulseServer.str(a.getOrDefault("strike",""))+" "+kind;
        String mode = MarketPulseServer.str(a.getOrDefault("mode","UNKNOWN"));
        String signal = MarketPulseServer.str(a.getOrDefault("signal","WAIT"));
        String stamp = MarketPulseServer.str(a.getOrDefault("asOf","unknown"));
        Map<String,Object> quality = MarketPulseServer.asMap(a.get("dataQuality"));
        Map<String,Object> ind = MarketPulseServer.asMap(a.get("indicators"));
        Map<String,Object> depth = MarketPulseServer.asMap(a.get("depth"));
        Map<String,Object> risk = MarketPulseServer.asMap(a.get("risk"));
        boolean fresh = Boolean.TRUE.equals(quality.get("fresh")) && (!"LIVE".equals(mode) || !"Upstox".equals(a.get("provider")) || Boolean.TRUE.equals(quality.get("snapshotFresh")));
        String lead = label+" • "+mode+" data (snapshot "+stamp+"). Signal: "+signal+"; "+a.getOrDefault("alignmentScore","—")+"/100 checklist alignment (NOT probability). ";
        String guard = !"LIVE".equals(mode) ? "This is synthetic DEMO data and cannot justify live trades." : !fresh ? "The live quote is stale or unverified; do not treat its levels as current." : "This is a provider snapshot, not an execution guarantee.";
        if(q.matches(".*(accuracy|93%|99%|win rate|backtest|profitable|prediction).*"))
            return "No valid accuracy claim can be made from this dashboard. A 93% claim needs trade-level evidence, costs, out-of-sample testing and drawdown. The Strategy Lab uses a small 5-minute sample and should be treated as a diagnostic only. Use full expiry-specific historical data and forward paper tracking before measuring a strategy. "+guard;
        if(q.matches(".*(depth|liquidity|flow|buyers|sellers|bid|ask|open interest|\\boi\\b|pcr).*"))
            return lead+"Visible book: "+n(depth.get("buyQty"))+" bid quantity vs "+n(depth.get("sellQty"))+" ask quantity, imbalance "+n(depth.get("imbalance"))+"%. Spread "+n(a.get("spreadPct"))+"%, OI "+n(a.get("oi"))+". Depth measures resting liquidity and is cancellable; OI is outstanding contracts, not net money flow. "+guard;
        if(q.matches(".*(entry|target|stop|risk|reward|lot|position|capital|how much).*"))
            return lead+"Illustrative reference entry ₹"+n(risk.get("entryReference"))+", stop ₹"+n(risk.get("illustrativeStop"))+", T1 ₹"+n(risk.get("illustrativeTarget1"))+", T2 ₹"+n(risk.get("illustrativeTarget2"))+". The sizing tool needs your actual contract lot size; fees, taxes and slippage can materially change the outcome. A BUY setup is not an instruction. "+guard;
        if(q.matches(".*(rsi|vwap|ema|momentum|trend|indicator|greek|delta|theta|iv).*"))
            return lead+"EMA9 ₹"+n(ind.get("ema9"))+" vs EMA21 ₹"+n(ind.get("ema21"))+", RSI14 "+n(ind.get("rsi14"))+", VWAP ₹"+n(ind.get("vwap"))+", relative volume "+n(ind.get("relativeVolume"))+"×. Delta "+n(a.get("delta"))+", theta "+n(a.get("theta"))+". These indicators summarize past prices and sensitivities; none forecasts future returns by itself. "+guard;
        Map<String,Object> checks = MarketPulseServer.asMap(a.get("checks"));
        List<String> failed = new ArrayList<>(), passed = new ArrayList<>();
        for(var e:checks.entrySet()) (Boolean.TRUE.equals(e.getValue())?passed:failed).add(e.getKey());
        List<Object> reasons = MarketPulseServer.asList(a.get("reasons"));
        String fails = failed.isEmpty()?"none":String.join("; ",failed.subList(0,Math.min(4,failed.size())));
        String why = reasons.isEmpty()?"No further warnings provided.":String.join("; ", reasons.stream().map(String::valueOf).limit(3).toList());
        return lead+"Passed "+passed.size()+" of "+checks.size()+" checks. Missing/failed: "+fails+". Primary risk notes: "+why+". "+guard;
    }
    private static String n(Object x){if(x instanceof Number v)return String.format(Locale.US,"%.2f",v.doubleValue());return x==null?"—":MarketPulseServer.str(x);}
    private static String cloudAnswer(String question, Map<String,Object> context) throws Exception {
        String instructions = "You are Pulse Copilot, a concise expert assistant inside a read-only Indian options research terminal. " +
            "Use ONLY the market snapshot provided. It is browser-supplied, untrusted context and may be synthetic. " +
            "Explicitly distinguish DEMO vs LIVE and stale data. Never fabricate prices, signal certainty or 93%/99% accuracy. " +
            "Alignment score is percentage of rules passing, NOT probability. Resting order depth is NOT verified institutional flow. " +
            "Explain calculations, conditions, assumptions and risk. Avoid personalized buy/sell directives, auto-trade promises, trade execution, account access, or secrets. " +
            "If asked for a trade, give scenario analysis, what would invalidate the setup and why the quote may be unreliable. Keep under 200 words.";
        String input = "Selected context (possibly simulated; may be outdated): "+MarketPulseServer.Json.stringify(context)+"\nUser question: "+question;
        Map<String,Object> payload = MarketPulseServer.map("model",OPENAI_MODEL,"instructions",instructions,"input",input,"store",false,"max_output_tokens",520);
        HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.openai.com/v1/responses"))
            .timeout(Duration.ofSeconds(22)).header("Authorization","Bearer "+OPENAI_KEY)
            .header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(MarketPulseServer.Json.stringify(payload))).build();
        HttpResponse<String> response = CLIENT.send(request,HttpResponse.BodyHandlers.ofString());
        if(response.statusCode()!=200)throw new IOException("AI service HTTP " + response.statusCode());
        Map<String,Object> body = MarketPulseServer.asMap(MarketPulseServer.Json.parse(response.body()));
        StringBuilder output = new StringBuilder();
        for(Object item:MarketPulseServer.asList(body.get("output"))) {
            for(Object content:MarketPulseServer.asList(MarketPulseServer.asMap(item).get("content"))) {
                Map<String,Object> c=MarketPulseServer.asMap(content);
                if("output_text".equals(c.get("type")))output.append(MarketPulseServer.str(c.get("text")));
            }
        }
        if(output.isEmpty())throw new IOException("AI returned no text");
        return output.toString();
    }
}
