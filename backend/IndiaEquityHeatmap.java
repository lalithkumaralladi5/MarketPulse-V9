import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.GZIPInputStream;

/** Complete Upstox BOD NSE/BSE equity segment catalogue with paginated real REST quotes.
 * This module never synthesizes a market return, market cap or quote. */
final class IndiaEquityHeatmap {
 private static final HttpClient HTTP=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(9)).build();
 private static final String TEST=System.getenv().getOrDefault("MARKETPULSE_BOD_TEST_BASE","");
 private static final String BASE=TEST.matches("http://(?:127\\.0\\.0\\.1|localhost):[0-9]{2,5}")?TEST+"/":"https://assets.upstox.com/market-quote/instruments/exchange/";
 private static final Map<String,Catalog> MASTER=new ConcurrentHashMap<>();
 private static final Map<String,Quotes> QUOTE_CACHE=new ConcurrentHashMap<>();
 private static final Object CATALOG_LOCK=new Object(), QUOTE_LOCK=new Object();
 private record Catalog(List<Map<String,Object>> rows,String downloaded,long expiry){}
 private record Quotes(Map<String,Map<String,Object>> values,long expiry){}
 private static Map<String,Object> map(Object... x){return MarketPulseServer.map(x);}
 private static Map<String,Object> m(Object x){return MarketPulseServer.asMap(x);}
 private static String s(Object x){return MarketPulseServer.str(x);}
 private static double n(Object x){return MarketPulseServer.num(x);}
 private static String ex(Map<String,String>q){String x=q.getOrDefault("exchange","NSE").toUpperCase(Locale.ROOT);if(!x.equals("NSE")&&!x.equals("BSE"))throw new MarketPulseServer.ApiException(400,"Use NSE or BSE");return x;}
 private static int integer(Map<String,String>q,String name,int def,int lower,int upper){
  try{int v=Integer.parseInt(q.getOrDefault(name,String.valueOf(def)));if(v<lower||v>upper)throw new NumberFormatException();return v;}
  catch(NumberFormatException e){throw new MarketPulseServer.ApiException(400,"Invalid "+name+"; permitted "+lower+"–"+upper);}
 }
 private static int hash(String x){int h=x.hashCode();h^=h>>>16;h*=0x7feb352d;h^=h>>>15;h*=0x846ca68b;h^=h>>>16;return h;}
 private static Catalog catalogue(String exchange){
  Catalog cached=MASTER.get(exchange);
  if(cached!=null&&cached.expiry>System.currentTimeMillis())return cached;
  synchronized(CATALOG_LOCK){
   cached=MASTER.get(exchange);if(cached!=null&&cached.expiry>System.currentTimeMillis())return cached;
   try{
    // The NSE/BSE files contain many derivatives. Never decompress the entire
    // master into a giant String: on the 192 MB Render JVM that can exhaust heap.
    HttpRequest req=HttpRequest.newBuilder(URI.create(BASE+exchange+".json.gz"))
        .timeout(Duration.ofSeconds(38)).header("Accept","application/octet-stream").GET().build();
    HttpResponse<InputStream> res=HTTP.send(req,HttpResponse.BodyHandlers.ofInputStream());
    if(res.statusCode()!=200){try(res.body()){throw new IOException("BOD HTTP "+res.statusCode());}}
    Map<String,Map<String,Object>> unique=new LinkedHashMap<>();
    // Decode one JSON object at a time. Keep only equity records, not hundreds
    // of thousands of FO records or a full uncompressed JSON tree.
    try(InputStream body=res.body();
        Reader in=new BufferedReader(new InputStreamReader(new GZIPInputStream(body),StandardCharsets.UTF_8),16384)){
     streamEquities(in,exchange,unique);
    }
    if(unique.isEmpty())throw new IOException("No equity-segment instruments present");
    List<Map<String,Object>> rows=new ArrayList<>(unique.values());
    rows.sort(Comparator.comparing(x->s(x.get("symbol")).toUpperCase(Locale.ROOT)));
    Catalog next=new Catalog(List.copyOf(rows),Instant.now().toString(),System.currentTimeMillis()+12*3600_000L);
    MASTER.put(exchange,next);return next;
   }catch(InterruptedException e){Thread.currentThread().interrupt();}
    catch(IOException|IllegalArgumentException e){System.err.println("NSE/BSE catalogue refresh failure: "+e.getClass().getSimpleName());}
   if(cached!=null)return cached;
   throw new MarketPulseServer.ApiException(503,"Upstox equity instrument catalogue unavailable; no sample substituted.");
  }
 }
 /** Bounded streaming reader for Upstox's top-level JSON array of instruments.
  * Handles strings/escapes and nested objects without holding the entire BOD.
  */
 static void streamEquities(Reader in,String exchange,Map<String,Map<String,Object>> unique) throws IOException {
  PushbackReader reader=new PushbackReader(in,2);
  int first=reader.read();while(first!=-1&&Character.isWhitespace(first))first=reader.read();
  if(first!='[')throw new IOException("Unexpected instrument master JSON shape");
  long totalChars=0;int value;
  while(true){
   value=reader.read();
   while(value!=-1&&(Character.isWhitespace(value)||value==','))value=reader.read();
   if(value==']')break;
   if(value!='{')throw new IOException("Unexpected BOD instrument record");
   StringBuilder obj=new StringBuilder(800);obj.append('{');
   int depth=1;boolean quoted=false,escaped=false;
   while(depth>0){
    int ch=reader.read();
    if(ch<0)throw new IOException("Truncated BOD instrument");
    char c=(char)ch;obj.append(c);
    if(obj.length()>100_000)throw new IOException("Unreasonably large BOD record");
    if(quoted){
     if(escaped)escaped=false;
     else if(c=='\\\\')escaped=true;
     else if(c=='"')quoted=false;
    }else if(c=='"')quoted=true;
    else if(c=='{')depth++;
    else if(c=='}')depth--;
   }
   totalChars+=obj.length();
   if(totalChars>200_000_000L)throw new IOException("BOD exceeds bounded stream size");
   // Fast skip of massive derivatives catalogue before any JSON map allocation.
   if(obj.indexOf("\""+exchange+"_EQ\"")<0)continue;
   Map<String,Object> row;
   try{row=MarketPulseServer.asMap(MarketPulseServer.Json.parse(obj.toString()));}
   catch(RuntimeException bad){throw new IOException("Malformed BOD equity record");}
   if(!(exchange+"_EQ").equals(s(row.get("segment"))))continue;
   String key=s(row.get("instrument_key")),symbol=s(row.get("trading_symbol")),name=s(row.get("name"));
   if(key.matches("(?:NSE|BSE)_EQ\\\\|[A-Za-z0-9._ -]{1,78}")&&!symbol.isBlank()&&symbol.length()<=70&&name.length()<=180){
    String industry=s(row.getOrDefault("sector",row.getOrDefault("industry","")));
    unique.putIfAbsent(key,map("key",key,"symbol",symbol,"name",name,"exchange",exchange,
      "segment",exchange+"_EQ","type",s(row.get("instrument_type")),"isin",s(row.get("isin")),
      "sector",industry.isBlank()?"UNCLASSIFIED":industry));
   }
  }
 }
 private static Map<String,Map<String,Object>> quotes(String exchange,List<Map<String,Object>> rows){
  List<String> keys=new ArrayList<>();for(var row:rows)keys.add(s(row.get("key")));
  String token=exchange+":"+String.join(",",keys);
  Quotes cached=QUOTE_CACHE.get(token);
  if(cached!=null&&cached.expiry>System.currentTimeMillis())return cached.values();
  synchronized(QUOTE_LOCK){
   cached=QUOTE_CACHE.get(token);if(cached!=null&&cached.expiry>System.currentTimeMillis())return cached.values();
   // At most 140 keys here, safely within Upstox V3's 500-key API limit.
   Object data=UpstoxAdapter.request("/v3/market-quote/quotes",Map.of("instrument_key",String.join(",",keys)),35_000);
   Set<String> valid=new HashSet<>(keys);Map<String,Map<String,Object>> found=new HashMap<>();
   for(Object raw:MarketPulseServer.asMap(data).values()){
    Map<String,Object> x=m(raw);String key=s(x.get("instrument_token"));if(!valid.contains(key))continue;
    double ltp=n(x.get("last_price")),prev=n(x.get("prev_close_price"));if(prev<=0)prev=n(x.get("cp"));
    if(ltp<=0||prev<=0)continue;
    long stamp=UpstoxAdapter.toMillis(x.get("last_trade_time"));
    long age=stamp>0?(System.currentTimeMillis()-stamp)/1000:-1;
    double vol=n(x.get("volume"));
    found.put(key,map("ltp",ltp,"changePct",MarketPulseServer.round((ltp-prev)*100/prev),
      "previousClose",prev,"volume",vol,"turnoverProxy",Math.max(0,vol*ltp),
      "quoteTime",stamp>0?Instant.ofEpochMilli(stamp).toString():"",
      "ageSeconds",age,"fresh",MarketPulseServer.normalHours()&&age>=-30&&age<=90,
      "quoteSource","UPSTOX_REST_V3"));
   }
   if(QUOTE_CACHE.size()>75)QUOTE_CACHE.clear();
   Quotes result=new Quotes(Map.copyOf(found),System.currentTimeMillis()+35_000);
   QUOTE_CACHE.put(token,result);return result.values();
  }
 }
 static Map<String,Object> page(Map<String,String>q){
  String exchange=ex(q),text=q.getOrDefault("query","").strip().toUpperCase(Locale.ROOT),series=q.getOrDefault("type","ALL").toUpperCase(Locale.ROOT);
  String sort=q.getOrDefault("sort","mosaic").toLowerCase(Locale.ROOT);
  if(text.length()>80||series.length()>15||!List.of("mosaic","alpha").contains(sort))throw new MarketPulseServer.ApiException(400,"Invalid heatmap filter");
  int page=integer(q,"page",1,1,1_000_000),size=integer(q,"limit",100,20,140);
  Catalog c=catalogue(exchange);List<Map<String,Object>> filtered=new ArrayList<>();
  for(Map<String,Object> item:c.rows()){
   if(!text.isEmpty()&&!s(item.get("symbol")).toUpperCase(Locale.ROOT).contains(text)&&
    !s(item.get("name")).toUpperCase(Locale.ROOT).contains(text)&&
    !s(item.get("isin")).toUpperCase(Locale.ROOT).contains(text))continue;
   if(!series.equals("ALL")&&!s(item.get("type")).equalsIgnoreCase(series))continue;
   filtered.add(item);
  }
  if(sort.equals("mosaic")&&text.isEmpty())filtered.sort((a,b)->Integer.compareUnsigned(hash(s(a.get("key"))),hash(s(b.get("key")))));
  long start=((long)page-1)*size;
  List<Map<String,Object>> items=new ArrayList<>();
  for(long i=start;i<Math.min(filtered.size(),start+size);i++)items.add(new LinkedHashMap<>(filtered.get((int)i)));
  boolean live=UpstoxAdapter.enabled();int available=0,fresh=0;String error="";
  if(live&&!items.isEmpty())try{
   var quoted=quotes(exchange,items);
   for(var x:items){var row=quoted.get(s(x.get("key")));if(row!=null){x.putAll(row);available++;if(Boolean.TRUE.equals(row.get("fresh")))fresh++;}}
  }catch(MarketPulseServer.ApiException e){error="Provider quote batch unavailable; missing prices remain neutral.";}
  return map("mode",live?"LIVE":"DEMO","exchange",exchange,"catalogue","UPSTOX_BOD",
   "catalogueCount",c.rows().size(),"matchedCount",filtered.size(),"page",page,"limit",size,
   "totalPages",(filtered.size()+size-1)/size,"items",items,"quoteCount",available,
   "freshQuoteCount",fresh,"asOf",c.downloaded(),"quoteError",error,
   "quoteScope",live?"Upstox REST quote snapshots: selected page only":"NO BROKER QUOTES · CATALOGUE ONLY",
   "areaMeaning",live?"Current-day turnover proxy (price × volume) where quoted; else equal area":"Equal-area tiles · NOT market capitalization",
   "notice","BOD covers provider-listed equity-segment instruments; not a verified all-exchange count. Neutral cells have no verified quote.");
 }
}