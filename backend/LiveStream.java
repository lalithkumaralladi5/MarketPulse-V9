import com.sun.net.httpserver.HttpExchange;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Read-only SSE delivery of Upstox REST snapshots. Not an exchange WebSocket or an
 * exchange trade-tick feed. DEMO is explicitly synthetic. No credentials in events.
 */
final class LiveStream {
    private static final AtomicInteger CONNECTIONS = new AtomicInteger();
    private static final int MAX_CONNECTIONS = 3;
    private static final long MAX_DURATION = 120_000L;
    private static final long POLL = 3_000L; // quota-conscious REST polling
    private LiveStream(){}
    private static Map<String,Object> m(Object...kv){return MarketPulseServer.map(kv);}
    private static String str(Object x){return MarketPulseServer.str(x);}
    private static void event(OutputStream o,String type,Object value) throws IOException {
        String line="event: "+type+"\ndata: "+MarketPulseServer.Json.stringify(value)+"\n\n";
        o.write(line.getBytes(StandardCharsets.UTF_8));o.flush();
    }
    static void stream(HttpExchange ex,Map<String,String> q) throws IOException {
        if(CONNECTIONS.incrementAndGet()>MAX_CONNECTIONS){
            CONNECTIONS.decrementAndGet();
            MarketPulseServer.send(ex,429,m("error","Maximum live connections reached; close another tab."));return;
        }
        boolean headers=false;
        try{
            // Key and timeframe validated, and genuine historical candles are sourced,
            // by the same API that powers the normal chart terminal.
            Map<String,Object> history=MarketUniverse.chart(q);
            String key=str(history.get("key"));boolean live=UpstoxAdapter.enabled();
            ex.getResponseHeaders().set("Content-Type","text/event-stream; charset=utf-8");
            ex.getResponseHeaders().set("Cache-Control","no-store");
            ex.getResponseHeaders().set("X-Accel-Buffering","no");
            ex.sendResponseHeaders(200,0);headers=true;
            try(OutputStream o=ex.getResponseBody()){
                event(o,"hello",m("key",key,"mode",live?"LIVE":"DEMO",
                    "source",live?"Upstox V3 full quote · server-side REST polling, not exchange ticks":"SYNTHETIC DEMO · NOT MARKET DATA",
                    "interval",history.get("interval"),"marketOpen",MarketPulseServer.normalHours(),"pollMs",POLL));
                event(o,"snapshot",history);
                long started=System.currentTimeMillis(),lastStatus=0;
                String lastQuoteStamp="";double lastPrice=Double.NaN;
                Random random=new Random();double demoPrice=100;
                List<Object> bars=MarketPulseServer.asList(history.get("candles"));
                if(!bars.isEmpty())demoPrice=MarketPulseServer.num(MarketPulseServer.asMap(bars.get(bars.size()-1)).get("close"));
                int errors=0;
                while(System.currentTimeMillis()-started<MAX_DURATION){
                    if(live){
                        try{
                            Map<String,Object> quote=MarketUniverse.quote(q,2_000);
                            boolean fresh=Boolean.TRUE.equals(quote.get("fresh"))&&MarketPulseServer.normalHours();
                            String timestamp=str(quote.get("timestamp"));
                            double price=MarketPulseServer.num(quote.get("ltp"));
                            long now=System.currentTimeMillis();
                            errors=0;
                            if(price>0 && (!timestamp.equals(lastQuoteStamp)||price!=lastPrice)){
                                event(o,"tick",m("price",price,"exchangeTime",timestamp,
                                    "receivedAt",Instant.now().toString(),"fresh",fresh,
                                    "marketOpen",MarketPulseServer.normalHours(),
                                    "ageSeconds",quote.get("ageSeconds"),"volume",quote.get("volume"),
                                    "bid",quote.get("bid"),"ask",quote.get("ask"),
                                    "bidQty",quote.get("bidQty"),"askQty",quote.get("askQty"),
                                    "previousClose",quote.get("previousClose"),"synthetic",false));
                                lastQuoteStamp=timestamp;lastPrice=price;
                            }
                            // Emit freshness independently of ticks. Market closure or a
                            // silent/illiquid symbol must never leave an active signal.
                            if(now-lastStatus>=POLL){
                                event(o,"status",m("fresh",fresh,"marketOpen",MarketPulseServer.normalHours(),
                                    "ageSeconds",quote.get("ageSeconds"),
                                    "message",fresh?"REST quote recent · waiting for updates":"Market closed or last trade stale · forecasts gated"));
                                lastStatus=now;
                            }
                        }catch(MarketPulseServer.ApiException err){
                            errors++;
                            event(o,"status",m("fresh",false,"marketOpen",false,"error",true,
                                "message",err.getMessage()));
                            if(errors>=5)break;
                        }
                    }else{
                        demoPrice=Math.max(.5,demoPrice*(1+random.nextGaussian()*.00045));
                        event(o,"tick",m("price",MarketPulseServer.round(demoPrice),
                            "receivedAt",Instant.now().toString(),"exchangeTime","",
                            "fresh",false,"marketOpen",false,"synthetic",true,"volume",100+random.nextInt(250)));
                    }
                    try{Thread.sleep(live?POLL:900);}catch(InterruptedException e){
                        Thread.currentThread().interrupt();break;
                    }
                }
                event(o,"bye",m("reason","Stream rotated; EventSource can reconnect."));
            }
        }catch(MarketPulseServer.ApiException e){
            if(!headers)MarketPulseServer.send(ex,e.status,m("error",e.getMessage()));
        }catch(IOException disconnect){
            // A browser switching tabs or Render ending an SSE connection is normal.
            if(!headers)throw disconnect;
        }finally{CONNECTIONS.decrementAndGet();ex.close();}
    }
}