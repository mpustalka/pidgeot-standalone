import type {HTMLAttributes} from 'react';
export function Card({className='',...props}:HTMLAttributes<HTMLDivElement>){return <div className={`rounded-xl ${className}`} {...props}/>}
