import { redirect } from 'next/navigation';

/** Landing page: send the radiologist to the prediction workspace. */
export default function HomePage() {
  redirect('/predict');
}
