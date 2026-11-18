import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;

/** Isolated loopback-only Python ML service. Never forwards broker token to ML service. */
final class MlBridge {
    private static final HttpClient CLIENT=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    private static final URI HEALTH=URI.create("http://127.0.0.1:8766/health");
    private static final URI PREDICT=URI.create("http://127.0.0.1:8766/predict");
    private static Map<String,Object> map(Object... p){return MarketPulseServer.map(p);}
    static Object status(){
        try{return call(HEALTH,"GET",null);}catch(Exception e){return map("ready",false,"service","MarketPulse ML","reason","Local ML service is not started. Run run-ml-windows.bat after installing Python requirements.","ordersEnabled",false);}
    }
    static Object predict(Map<String,String> q){
        String key=q.getOrDefault("key","");
        // MarketUniverse validates the exact Upstox instrument key and interval.
        if(!MarketPulseServer.UPSTOX) return map("mode","DEMO","signal","NO_LIVE_PREDICTION","reason","Live ML predictions require real Upstox data and a trained model. Demo candles are synthetic.");
        Map<String,Object> history=MarketUniverse.chart(q);
        Object data=history.get("candles");
        List<Object> bars=MarketPulseServer.asList(data);
        if(bars.size()<35)return map("mode","LIVE","signal","NO_HISTORY","reason","Need 35 or more recent genuine candles for inference.","bars",bars.size());
        Object pred;
        try{pred=call(PREDICT,"POST",MarketPulseServer.Json.stringify(map("candles",bars,"instrumentKey",key)));}
        catch(Exception e){return map("mode","LIVE","signal","MODEL_OFFLINE","reason","ML service missing, untrained, or unable to score the selected contract. No prediction is shown.");}
        Map<String,Object> result=MarketPulseServer.asMap(pred);
        // A model output is not a trading instruction. Freshness check uses quote timestamps.
        Map<String,Object> quote;
        try {quote=MarketUniverse.quote(q);} catch(Exception e) {
            return map("mode","LIVE","signal","WAIT_QUOTE","reason","No verified quote. Model result suppressed.","model",result);
        }
        boolean fresh=Boolean.TRUE.equals(quote.get("fresh"));
        return map("mode","LIVE","signal",fresh?result.get("signal"):"WAIT_STALE",
                "researchOnly",true,"quoteFresh",fresh,"quoteAgeSeconds",quote.get("ageSeconds"),
                "key",key,"interval",history.get("interval"),"model",result,
                "reason",fresh?"Directional model output. No execution permission or proven profitability.":"Market closed or quote stale. No actionable ML signal.");
    }
    private static Object call(URI uri,String method,String payload) throws Exception {
        HttpRequest.Builder builder=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(6)).header("Accept","application/json");
        HttpRequest request=(payload==null?builder.GET():builder.header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(payload))).build();
        HttpResponse<String> response=CLIENT.send(request,HttpResponse.BodyHandlers.ofString());
        if(response.statusCode()!=200)throw new IllegalStateException("ML service HTTP "+response.statusCode());
        return MarketPulseServer.Json.parse(response.body());
    }
}
