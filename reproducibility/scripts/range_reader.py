"""Bounded HTTP Range file object. Never silently download a whole raster."""
import io
import re
import urllib.request


class RangeReader(io.RawIOBase):
    def __init__(self, url, block_size=65536, timeout=30):
        super().__init__()
        self.url, self.block_size, self.timeout = url, block_size, timeout
        self.position = 0
        self.cache = {}
        self.size = None
        self.requests = 0
        self.metadata_bytes = 0
        self.etag = None
        self.last_modified = None
        self._block(0)

    @property
    def name(self):
        return self.url

    def _block(self, index):
        if index in self.cache:
            return self.cache[index]
        start = index * self.block_size
        end = start + self.block_size - 1
        if self.size is not None:
            end = min(end, self.size - 1)
        req = urllib.request.Request(self.url, headers={
            'Range': f'bytes={start}-{end}', 'Accept-Encoding': 'identity',
            'User-Agent': 'Sam-Landshaft-reproducibility/0.1',
        })
        with urllib.request.urlopen(req, timeout=self.timeout) as response:
            if response.status != 206:
                raise ValueError('HTTP 206 required; server ignored Range. Full download refused.')
            match = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)', response.headers.get('Content-Range', ''))
            if not match:
                raise ValueError('Missing or invalid Content-Range')
            first, last, size = map(int, match.groups())
            if first != start or last > end or last < first:
                raise ValueError('Server returned a different byte range')
            if self.size is not None and size != self.size:
                raise ValueError('Remote file size changed during inspection')
            etag = response.headers.get('ETag')
            if self.etag is not None and etag != self.etag:
                raise ValueError('Remote ETag changed during inspection')
            body = response.read(self.block_size + 1)
            if len(body) != last - first + 1:
                raise ValueError('Incomplete or oversized Range response')
            self.size, self.etag = size, etag
            self.last_modified = response.headers.get('Last-Modified')
        self.cache[index] = body
        self.requests += 1
        self.metadata_bytes += len(body)
        return body

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=io.SEEK_SET):
        position = offset if whence == io.SEEK_SET else (
            self.position + offset if whence == io.SEEK_CUR else
            self.size + offset if whence == io.SEEK_END else None)
        if position is None or position < 0:
            raise ValueError('Invalid seek')
        self.position = position
        return position

    def read(self, size=-1):
        if size < 0:
            raise ValueError('Unbounded remote reads are disabled')
        remaining = min(size, max(0, self.size - self.position))
        chunks = []
        while remaining:
            index, offset = divmod(self.position, self.block_size)
            block = self._block(index)
            count = min(remaining, len(block) - offset)
            if count <= 0:
                raise ValueError('Range response did not cover the requested bytes')
            chunks.append(block[offset:offset + count])
            self.position += count
            remaining -= count
        return b''.join(chunks)
