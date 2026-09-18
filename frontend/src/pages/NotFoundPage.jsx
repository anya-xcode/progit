import { Compass } from "lucide-react";
import { Link } from "react-router";
import Button from "../components/ui/Button.jsx";
import { Page } from "../components/ui/PageHeader.jsx";
import { EmptyState } from "../components/ui/States.jsx";

export default function NotFoundPage() {
  return (
    <Page>
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="This page does not exist."
        action={
          <Link to="/">
            <Button variant="primary">Back to dashboard</Button>
          </Link>
        }
      />
    </Page>
  );
}
