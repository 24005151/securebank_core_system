from fastapi import Request


def get_client_ip(request: Request) -> str:
    if request.client:
        return request.client.host
    return "unknown"
