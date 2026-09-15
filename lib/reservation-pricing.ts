import {type Booking} from "./travel";

export function pricePerTraveler(booking:Booking):number {
 if(booking.priceBasis==="traveler"&&booking.perTravelerPrice!=null)return booking.perTravelerPrice;
 return Math.round(booking.total*100/(booking.travelers||1))/100;
}

export function updateReservationPricing(booking:Booking,field:"travelers"|"total"|"traveler",value:number):Booking {
 if(field==="total")return {...booking,total:value,priceBasis:"total",perTravelerPrice:undefined};
 if(field==="traveler")return {...booking,total:Math.round(value*100)*(booking.travelers||1)/100,priceBasis:"traveler",perTravelerPrice:value};
 const unit=pricePerTraveler(booking);
 return {...booking,travelers:value,perTravelerPrice:booking.priceBasis==="traveler"?unit:undefined,total:booking.priceBasis==="traveler"&&Number.isFinite(value)?Math.round(unit*100)*value/100:booking.total};
}
