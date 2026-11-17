import {z} from "zod";
export type HotelMatch={name:string;address:string;mapUrl:string};
const feature=z.object({properties:z.object({name:z.string(),street:z.string(),housenumber:z.string().optional(),city:z.string().optional(),district:z.string().optional(),state:z.string().optional(),postcode:z.string().optional(),country:z.string(),osm_value:z.string()}).passthrough(),geometry:z.object({coordinates:z.tuple([z.number().min(-180).max(180),z.number().min(-90).max(90)])})});
export function parseHotelMatches(raw:unknown):HotelMatch[]{
 const data=z.object({features:z.array(z.unknown())}).safeParse(raw);
 if(!data.success)throw new Error("Invalid hotel search response");
 const matches:HotelMatch[]=[];
 for(const entry of data.data.features){
  const parsed=feature.safeParse(entry);if(!parsed.success)continue;
  const {properties:p,geometry:{coordinates:[lon,lat]}}=parsed.data;
  if(!["hotel","motel","guest_house","hostel","apartment","resort"].includes(p.osm_value))continue;
  const address=[...new Set([[p.housenumber,p.street].filter(Boolean).join(" "),p.city||p.district,p.state,p.postcode,p.country].filter(Boolean))].join(", ");
  if(!p.street.trim()||matches.some(m=>m.name===p.name&&m.address===address))continue;
  matches.push({name:p.name,address,mapUrl:`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`});
 }
 return matches.slice(0,5);
}
